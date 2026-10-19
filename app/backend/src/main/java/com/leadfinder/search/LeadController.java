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

    public record DraftRequest(@Pattern(regexp = "en|fr|ar") String language,
                               @Pattern(regexp = "email|whatsapp") String channel) {}

    /** What a contact lookup added, so the UI can say it plainly. */
    public record EnrichResponse(LeadDto lead, List<String> found, String note, List<String> sources) {}

    /** counts: leads per status for the current filters, ignoring the status filter itself. */
    public record LeadPage(List<LeadDto> items, long total, int page, int size, Map<String, Long> counts) {}

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
                         @RequestParam(defaultValue = "") String q,
                         @RequestParam(defaultValue = "0") long searchId,
                         @RequestParam(defaultValue = "score") String sort,
                         @RequestParam(defaultValue = "0") int page,
                         @RequestParam(defaultValue = "40") int size) {
        Long uid = userId(jwt);
        String st = validStatus(status);
        String pattern = likePattern(q);
        int pageSize = Math.max(1, Math.min(size, 100));
        Page<Lead> result = leads.search(uid, st, reachable, pattern, searchId,
                PageRequest.of(Math.max(0, page), pageSize, sortFor(sort)));

        Map<String, Long> counts = new LinkedHashMap<>();
        STATUSES.stream().sorted().forEach(s -> counts.put(s, 0L));
        for (Object[] row : leads.statusCounts(uid, reachable, pattern, searchId)) {
            counts.put((String) row[0], (Long) row[1]);
        }
        return new LeadPage(result.getContent().stream().map(LeadDto::of).toList(),
                result.getTotalElements(), result.getNumber(), result.getSize(), counts);
    }

    /** Same filters as the list, as a spreadsheet file. */
    @GetMapping("/export.csv")
    public ResponseEntity<byte[]> export(@AuthenticationPrincipal Jwt jwt,
                                         @RequestParam(defaultValue = "") String status,
                                         @RequestParam(defaultValue = "false") boolean reachable,
                                         @RequestParam(defaultValue = "") String q,
                                         @RequestParam(defaultValue = "0") long searchId,
                                         @RequestParam(defaultValue = "score") String sort) {
        List<Lead> rows = leads.search(userId(jwt), validStatus(status), reachable, likePattern(q), searchId,
                PageRequest.of(0, MAX_EXPORT, sortFor(sort))).getContent();
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("leads.csv").build().toString())
                .body(LeadCsv.build(rows));
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
        payload.put("senderName", user.getDisplayName());
        payload.put("language", req.language());
        payload.put("channel", req.channel());

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
        lead.setSubject(draft.subject() == null ? "" : draft.subject());
        lead.setEmailBody(withLinks(draft.body(), user));
        lead.setDraftLanguage(req.language());
        lead.setDraftChannel(req.channel());
        return LeadDto.of(leads.save(lead));
    }

    /** Adds the person's first two links under the message, unless the AI already wrote them. */
    public static String withLinks(String body, AppUser user) {
        var links = com.leadfinder.auth.ProfileController.ProfileDto.of(user).links();
        StringBuilder sb = new StringBuilder(body.stripTrailing());
        int added = 0;
        for (var l : links) {
            if (added == 2) break;
            if (body.contains(l.url())) continue;
            sb.append(added == 0 ? "\n\n" : "\n").append(l.label()).append(": ").append(l.url());
            added++;
        }
        return sb.toString();
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
