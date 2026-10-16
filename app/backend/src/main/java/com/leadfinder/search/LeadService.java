package com.leadfinder.search;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class LeadService {
    public record IngestResult(int found, int created) {}

    /** What an on-demand contact lookup added, in words the user can read. */
    public record EnrichOutcome(List<String> found) {}

    private static final Pattern SOCIAL = Pattern.compile(
            "(facebook|instagram|linkedin|twitter|tiktok|youtube|linktr)\\.", Pattern.CASE_INSENSITIVE);
    private static final int MAX_EMAILS = 5;

    private final LeadRepository leads;
    private final SearchLeadRepository links;

    /**
     * Stores the businesses a search found. A business the user already has (same place id, phone,
     * website, or name and address) is refreshed in place and keeps its status and message;
     * otherwise it is created. Ingests for one user are serialised, so two searches that finish at
     * the same moment cannot both create the same business.
     */
    @Transactional
    public IngestResult ingest(SearchJob job, List<IncomingLead> incoming) {
        leads.lockUser(job.getUserId());
        Set<Long> seen = new HashSet<>();
        int created = 0;
        for (IncomingLead in : incoming) {
            if (in.name() == null || in.name().isBlank()) {
                continue;
            }
            Optional<Lead> match = find(job.getUserId(), in);
            Lead lead = match.orElseGet(() -> {
                Lead l = new Lead();
                l.setUserId(job.getUserId());
                return l;
            });
            boolean isNew = match.isEmpty();
            refresh(lead, in, job);
            lead = leads.save(lead);
            if (isNew) {
                created++;
            }
            if (seen.add(lead.getId()) && !links.existsById(new SearchLead.Key(job.getId(), lead.getId()))) {
                links.save(new SearchLead(job.getId(), lead.getId()));
            }
        }
        return new IngestResult(seen.size(), created);
    }

    /**
     * Adds contact details found by an on-demand lookup. Existing values are never replaced:
     * a website or phone is only filled when missing, emails and social pages are added to the lists.
     */
    @Transactional
    public EnrichOutcome applyEnrichment(Lead lead, N8nClient.Enrichment found) {
        List<String> added = new ArrayList<>();

        if (isBlank(lead.getWebsite()) && isHttpUrl(found.website())) {
            lead.setWebsite(found.website().trim());
            added.add("website");
        }
        lead.setWebsiteHost(websiteHost(lead.getWebsite()));

        int before = emailList(lead.getEmails()).size();
        lead.setEmails(mergeEmails(lead.getEmails(), found.emails(), lead.getWebsiteHost()));
        int newEmails = emailList(lead.getEmails()).size() - before;
        if (newEmails > 0) added.add(newEmails == 1 ? "1 email" : newEmails + " emails");

        if (isBlank(lead.getPhone()) && found.phones() != null) {
            found.phones().stream().filter(p -> phoneKey(p) != null).findFirst().ifPresent(p -> {
                lead.setPhone(p.trim());
                added.add("phone number");
            });
        }
        lead.setPhoneKey(phoneKey(lead.getPhone()));

        int socialBefore = SocialLinks.normalize(split(lead.getSocial())).size();
        lead.setSocial(mergeSocial(lead.getSocial(), found.social()));
        if (SocialLinks.normalize(split(lead.getSocial())).size() > socialBefore) added.add("social page");

        lead.setContactCheckedAt(Instant.now());
        return new EnrichOutcome(added);
    }

    private Optional<Lead> find(Long userId, IncomingLead in) {
        if (notBlank(in.placeId())) {
            Optional<Lead> byPlace = leads.findFirstByUserIdAndPlaceId(userId, in.placeId());
            if (byPlace.isPresent()) {
                return byPlace;
            }
        }
        String phoneKey = phoneKey(in.phone());
        if (phoneKey != null) {
            Optional<Lead> byPhone = leads.findFirstByUserIdAndPhoneKey(userId, phoneKey);
            if (byPhone.isPresent()) {
                return byPhone;
            }
        }
        String host = websiteHost(in.website());
        if (host != null) {
            Optional<Lead> byHost = leads.findFirstByUserIdAndWebsiteHost(userId, host);
            if (byHost.isPresent()) {
                return byHost;
            }
        }
        // Last resort for businesses with no phone or website: same name at the same address.
        return notBlank(in.address())
                ? leads.findFirstByUserIdAndNameIgnoreCaseAndAddressIgnoreCase(userId, in.name().trim(), in.address())
                : Optional.empty();
    }

    /** Newer data wins, but a missing value never erases a known one. Status and message are untouched. */
    private void refresh(Lead lead, IncomingLead in, SearchJob job) {
        lead.setNiche(job.getNiche());
        lead.setCity(job.getCity());
        lead.setName(in.name().trim());
        if (notBlank(in.address())) lead.setAddress(in.address());
        if (notBlank(in.phone())) lead.setPhone(in.phone());
        if (notBlank(in.website())) lead.setWebsite(in.website());
        if (in.rating() != null) lead.setRating(in.rating());
        if (in.reviews() != null) lead.setReviews(in.reviews());
        if (notBlank(in.placeId()) && lead.getPlaceId() == null) lead.setPlaceId(in.placeId());
        lead.setWebsiteHost(websiteHost(lead.getWebsite()));
        lead.setEmails(mergeEmails(lead.getEmails(), in.emails(), lead.getWebsiteHost()));
        lead.setSocial(mergeSocial(lead.getSocial(), in.social()));
        lead.setScore(in.score());
        lead.setReason(in.reason());
        lead.setPhoneKey(phoneKey(lead.getPhone()));
        lead.setLastSeenAt(Instant.now());
    }

    private static String mergeEmails(String existing, List<String> incoming, String websiteHost) {
        List<String> all = new ArrayList<>(emailList(existing));
        if (incoming != null) all.addAll(incoming);
        List<String> ranked = EmailRanker.rank(all, websiteHost);
        return ranked.isEmpty() ? null : String.join(",", ranked.subList(0, Math.min(MAX_EMAILS, ranked.size())));
    }

    private static String mergeSocial(String existing, List<String> incoming) {
        List<String> all = new ArrayList<>(split(existing));
        if (incoming != null) all.addAll(incoming);
        List<String> clean = SocialLinks.normalize(all);
        return clean.isEmpty() ? null : String.join(",", clean);
    }

    static List<String> emailList(String csv) {
        return split(csv);
    }

    static List<String> split(String csv) {
        List<String> out = new ArrayList<>();
        if (csv != null) {
            for (String p : csv.split(",")) {
                if (!p.isBlank()) out.add(p.trim());
            }
        }
        return out;
    }

    /** Last 8 digits, so "+216 71 874 421" and "71874421" are the same number. */
    static String phoneKey(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("\\D", "");
        return digits.length() < 6 ? null : digits.substring(Math.max(0, digits.length() - 8));
    }

    /** Host without "www.", or null for missing, unparsable or social-media addresses. */
    static String websiteHost(String website) {
        if (!notBlank(website)) return null;
        try {
            String url = website.contains("://") ? website : "http://" + website;
            String host = URI.create(url.trim()).getHost();
            if (host == null) return null;
            host = host.toLowerCase().replaceFirst("^www\\.", "");
            return SOCIAL.matcher(host + ".").find() ? null : host;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static boolean isHttpUrl(String s) {
        if (!notBlank(s)) return false;
        try {
            String scheme = URI.create(s.trim()).getScheme();
            return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static boolean notBlank(String s) {
        return !isBlank(s);
    }
}
