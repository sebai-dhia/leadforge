package com.leadfinder.search;

import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/leads")
@RequiredArgsConstructor
public class LeadController {

    public record StatusUpdate(@Pattern(regexp = "NEW|CONTACTED|REPLIED|NOT_INTERESTED") String status) {}

    public record DraftRequest(@Pattern(regexp = "en|fr|ar") String language,
                               @Pattern(regexp = "email|whatsapp") String channel) {}

    private final LeadRepository leads;
    private final SearchJobRepository jobs;
    private final UserRepository users;
    private final N8nClient n8n;

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
        SearchJob job = jobs.findById(lead.getJobId()).orElseThrow();
        AppUser user = users.findById(Long.valueOf(jwt.getSubject())).orElseThrow();

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("leadName", lead.getName());
        payload.put("address", lead.getAddress());
        payload.put("website", lead.getWebsite());
        payload.put("reason", lead.getReason());
        payload.put("niche", job.getNiche());
        payload.put("city", job.getCity());
        payload.put("offer", user.getOffer());
        payload.put("senderName", user.getDisplayName());
        payload.put("language", req.language());
        payload.put("channel", req.channel());

        N8nClient.Draft draft;
        try {
            draft = n8n.draft(payload);
        } catch (RuntimeException e) {
            log.error("Draft request failed for lead {}", id, e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The AI could not write the message");
        }
        if (draft == null || draft.body() == null || draft.body().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The AI returned an empty message");
        }
        lead.setSubject(draft.subject() == null ? "" : draft.subject());
        lead.setEmailBody(draft.body());
        lead.setDraftLanguage(req.language());
        lead.setDraftChannel(req.channel());
        return LeadDto.of(leads.save(lead));
    }

    /** A lead is only reachable through a search that belongs to the caller. */
    private Lead ownedLead(Jwt jwt, Long id) {
        Lead lead = leads.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        jobs.findByIdAndUserId(lead.getJobId(), Long.valueOf(jwt.getSubject()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return lead;
    }
}
