package com.leadfinder.search;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class LeadService {
    public record IngestResult(int found, int created) {}

    private static final Pattern SOCIAL = Pattern.compile(
            "(facebook|instagram|linkedin|twitter|tiktok|youtube|linktr)\\.", Pattern.CASE_INSENSITIVE);

    private final LeadRepository leads;
    private final SearchLeadRepository links;

    /**
     * Stores the businesses a search found. A business the user already has (same place id, phone
     * or website) is refreshed in place and keeps its status and message; otherwise it is created.
     */
    @Transactional
    public IngestResult ingest(SearchJob job, List<IncomingLead> incoming) {
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
        lead.setEmails(mergeEmails(lead.getEmails(), in.emails()));
        lead.setScore(in.score());
        lead.setReason(in.reason());
        lead.setPhoneKey(phoneKey(lead.getPhone()));
        lead.setWebsiteHost(websiteHost(lead.getWebsite()));
        lead.setLastSeenAt(Instant.now());
    }

    private static String mergeEmails(String existing, List<String> incoming) {
        Set<String> all = new LinkedHashSet<>();
        if (notBlank(existing)) {
            for (String e : existing.split(",")) {
                if (notBlank(e)) all.add(e.trim());
            }
        }
        if (incoming != null) {
            incoming.stream().filter(LeadService::notBlank).map(String::trim).forEach(all::add);
        }
        List<String> limited = new ArrayList<>(all);
        return limited.isEmpty() ? null : String.join(",", limited.subList(0, Math.min(5, limited.size())));
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

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
