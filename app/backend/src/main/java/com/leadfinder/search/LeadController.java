package com.leadfinder.search;

import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.UserRepository;
import com.leadfinder.usage.UsageService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@RestController
@RequestMapping("/api/leads")
@RequiredArgsConstructor
public class LeadController {

    private static final Set<String> STATUSES = Set.of("NEW", "CONTACTED", "REPLIED", "NOT_INTERESTED");
    private static final int MAX_EXPORT = 5000;

    public record StatusUpdate(@Pattern(regexp = "NEW|CONTACTED|REPLIED|NOT_INTERESTED") String status) {}

    public record HiddenUpdate(boolean hidden) {}

    /** The person's own edits of a written message. */
    public record MessageUpdate(@jakarta.validation.constraints.Size(max = 500) String subject,
                                @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 5000) String body) {}

    public record DraftRequest(@Pattern(regexp = "en|fr|ar") String language,
                               @Pattern(regexp = "email|whatsapp") String channel) {}

    /** What a contact lookup added, so the UI can say it plainly. */
    public record EnrichResponse(LeadDto lead, List<String> found, String note, List<String> sources) {}

    /** counts: leads per status for the current filters, ignoring the status filter itself. hiddenCount: hidden leads of the user. */
    public record LeadPage(List<LeadDto> items, long total, int page, int size, Map<String, Long> counts, long hiddenCount) {}

    private final LeadRepository leads;
    private final UserRepository users;
    private final N8nClient n8n;
    private final UsageService usage;
    private final LeadService leadService;

    /** Every lead of the caller across all searches, with optional filters. */
    @GetMapping
    public LeadPage list(@AuthenticationPrincipal Jwt jwt,
                         @RequestParam(defaultValue = "") String status,
                         @RequestParam(defaultValue = "false") boolean reachable,
                         @RequestParam(defaultValue = "false") boolean hidden,
                         @RequestParam(defaultValue = "") String q,
                         @RequestParam(defaultValue = "0") long searchId,
                         @RequestParam(defaultValue = "score") String sort,
                         @RequestParam(defaultValue = "0") int page,
                         @RequestParam(defaultValue = "40") int size) {
        Long uid = userId(jwt);
        String st = validStatus(status);
        String pattern = likePattern(q);
        int pageSize = Math.max(1, Math.min(size, 100));
        Page<Lead> result = leads.search(uid, hidden, st, reachable, pattern, searchId,
                PageRequest.of(Math.max(0, page), pageSize, sortFor(sort)));

        Map<String, Long> counts = new LinkedHashMap<>();
        STATUSES.stream().sorted().forEach(s -> counts.put(s, 0L));
        for (Object[] row : leads.statusCounts(uid, hidden, reachable, pattern, searchId)) {
            counts.put((String) row[0], (Long) row[1]);
        }
        return new LeadPage(result.getContent().stream().map(LeadDto::of).toList(),
                result.getTotalElements(), result.getNumber(), result.getSize(), counts,
                leads.countByUserIdAndHiddenAtIsNotNull(uid));
    }

    /** Same filters as the list, as a spreadsheet file. */
    @GetMapping("/export.csv")
    public ResponseEntity<byte[]> export(@AuthenticationPrincipal Jwt jwt,
                                         @RequestParam(defaultValue = "") String status,
                                         @RequestParam(defaultValue = "false") boolean reachable,
                                         @RequestParam(defaultValue = "") String q,
                                         @RequestParam(defaultValue = "0") long searchId,
                                         @RequestParam(defaultValue = "score") String sort) {
        List<Lead> rows = leads.search(userId(jwt), false, validStatus(status), reachable, likePattern(q), searchId,
                PageRequest.of(0, MAX_EXPORT, sortFor(sort))).getContent();
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("leads.csv").build().toString())
                .body(LeadCsv.build(rows));
    }

    /** Hides a lead from the lists, or brings it back. A hidden lead stays known, so a new search does not offer it as new. */
    @PatchMapping("/{id}/hidden")
    public LeadDto setHidden(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id,
                             @RequestBody HiddenUpdate req) {
        Lead lead = ownedLead(jwt, id);
        lead.setHiddenAt(req.hidden() ? java.time.Instant.now() : null);
        return LeadDto.of(leads.save(lead));
    }

    /** Saves the person's own edits of the message, so they are still there next time. */
    @PatchMapping("/{id}/message")
    public LeadDto saveMessage(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id,
                               @Valid @RequestBody MessageUpdate req) {
        Lead lead = ownedLead(jwt, id);
        lead.setSubject(req.subject() == null ? "" : req.subject());
        lead.setEmailBody(req.body());
        return LeadDto.of(leads.save(lead));
    }

    /** Removes the written message (the lead itself stays). */
    @DeleteMapping("/{id}/message")
    public LeadDto clearMessage(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        Lead lead = ownedLead(jwt, id);
        lead.setSubject(null);
        lead.setEmailBody(null);
        lead.setDraftLanguage(null);
        lead.setDraftChannel(null);
        lead.setDraftPromptVersion(null);
        return LeadDto.of(leads.save(lead));
    }

    @PatchMapping("/{id}/status")
    public LeadDto setStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id,
                             @Valid @RequestBody StatusUpdate req) {
        Lead lead = ownedLead(jwt, id);
        lead.setStatus(req.status());
        return LeadDto.of(leads.save(lead));
    }

    /** Writes one message for one lead, on request. The AI call happens in n8n. */
    @PostMapping("/{id}/draft")
    public LeadDto draft(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id,
                         @Valid @RequestBody DraftRequest req) {
        Lead lead = ownedLead(jwt, id);
        AppUser user = users.findById(userId(jwt)).orElseThrow();

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("leadName", lead.getName());
        payload.put("address", lead.getAddress());
        payload.put("website", lead.getWebsite());
        payload.put("reason", lead.getReasonText());
        payload.put("niche", lead.getNiche());
        payload.put("city", lead.getCity());
        payload.put("offer", user.getOffer());
        payload.put("senderName", senderName(user));
        payload.put("language", req.language());
        payload.put("channel", req.channel());
        // what the message may say about the sender and about the business
        var profile = com.leadfinder.auth.ProfileController.ProfileDto.of(user);
        payload.put("headline", profile.headline());
        payload.put("senderCity", profile.city());
        payload.put("about", profile.about());
        payload.put("services", profile.services());
        payload.put("targets", profile.targets());
        payload.put("links", profile.links());
        String linksHash = SenderKnowledge.hashOf(user);
        payload.put("linksHash", linksHash);
        payload.put("linksKnowledge", SenderKnowledge.fresh(user, linksHash));
        payload.put("rating", lead.getRating());
        payload.put("reviews", lead.getReviews());
        payload.put("social", LeadService.split(lead.getSocial()));

        Long usageId = usage.consume(userId(jwt), UsageService.Kind.DRAFT);
        N8nClient.Draft draft;
        try {
            draft = n8n.draft(payload);
        } catch (RuntimeException e) {
            log.error("Draft request failed for lead {}", id, e);
            usage.refund(usageId);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The AI could not write the message");
        }
        if (draft == null || draft.body() == null || draft.body().isBlank()) {
            usage.refund(usageId);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The AI returned an empty message");
        }
        if (SenderKnowledge.store(user, linksHash, draft.linksHash(), draft.linksKnowledge())) {
            users.save(user);
        }
        lead.setSubject(draft.subject() == null ? "" : draft.subject());
        lead.setEmailBody(draft.body());
        lead.setDraftLanguage(req.language());
        lead.setDraftPromptVersion(draft.promptVersion() == null || draft.promptVersion().isBlank() ? null : draft.promptVersion());
        lead.setDraftChannel(req.channel());
        return LeadDto.of(leads.save(lead));
    }

    /** A guest has no real name: the message then does not introduce or sign with one. */
    private static String senderName(AppUser user) {
        String name = user.getDisplayName() == null ? "" : user.getDisplayName().strip();
        return "GUEST".equals(user.getRole()) || name.equalsIgnoreCase("guest") ? "" : name;
    }

    /**
     * Looks for missing contact details of one lead: its own website and contact page, and its
     * Facebook or Instagram page. Only fills gaps; nothing already known is replaced.
     */
    @PostMapping("/{id}/enrich")
    public EnrichResponse enrich(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        Lead lead = ownedLead(jwt, id);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("leadName", lead.getName());
        payload.put("address", lead.getAddress());
        payload.put("niche", lead.getNiche());
        payload.put("city", lead.getCity());
        payload.put("website", lead.getWebsite());
        payload.put("phone", lead.getPhone());

        Long usageId = usage.consume(userId(jwt), UsageService.Kind.ENRICH);
        N8nClient.Enrichment found;
        try {
            found = n8n.enrich(payload);
        } catch (RuntimeException e) {
            log.error("Contact lookup failed for lead {}", id, e);
            usage.refund(usageId);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The contact lookup could not run");
        }
        if (found == null) {
            found = new N8nClient.Enrichment(null, List.of(), List.of(), List.of(), List.of(), "Nothing was returned.");
        }
        LeadService.EnrichOutcome outcome = leadService.applyEnrichment(lead, found);
        Lead saved = leads.save(lead);
        return new EnrichResponse(LeadDto.of(saved), outcome.found(), found.note(),
                found.sources() == null ? List.of() : found.sources());
    }

    private Long userId(Jwt jwt) {
        return Long.valueOf(jwt.getSubject());
    }

    /** A lead is only reachable by the user who owns it. */
    private Lead ownedLead(Jwt jwt, Long id) {
        return leads.findByIdAndUserId(id, userId(jwt))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private static String validStatus(String status) {
        if (status.isBlank()) return "";
        if (!STATUSES.contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown status");
        }
        return status;
    }

    /** Lowercase LIKE pattern with the user's own % and _ escaped, or "" for no search text. */
    private static String likePattern(String q) {
        String t = q.trim().toLowerCase();
        if (t.isEmpty()) return "";
        return "%" + t.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    private static Sort sortFor(String sort) {
        return switch (sort) {
            case "recent" -> Sort.by(Sort.Order.desc("lastSeenAt"), Sort.Order.asc("name"));
            case "name" -> Sort.by(Sort.Order.asc("name"));
            default -> Sort.by(Sort.Order.desc("score").nullsLast(), Sort.Order.asc("name"));
        };
    }
}
