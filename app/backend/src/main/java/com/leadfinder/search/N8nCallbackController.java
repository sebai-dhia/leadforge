package com.leadfinder.search;

import com.leadfinder.config.AppProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

@RestController
@RequestMapping("/api/internal/n8n")
@RequiredArgsConstructor
public class N8nCallbackController {

    public record IncomingLead(String name, String address, String phone, Double rating, Integer reviews,
                               String website, List<String> emails, Integer score, String reason,
                               String subject, String emailBody) {}

    public record Results(Long jobId, List<IncomingLead> leads) {}

    private final SearchJobRepository jobs;
    private final LeadRepository leads;
    private final AppProperties props;

    @PostMapping("/results")
    @Transactional
    public void results(@RequestHeader("X-Callback-Secret") String secret, @RequestBody Results body) {
        boolean ok = MessageDigest.isEqual(
                secret.getBytes(StandardCharsets.UTF_8),
                props.n8n().callbackSecret().getBytes(StandardCharsets.UTF_8));
        if (!ok) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        SearchJob job = jobs.findById(body.jobId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (job.getStatus() == SearchJob.Status.DONE) {
            return; // idempotent: ignore duplicate callbacks
        }
        for (IncomingLead in : body.leads() == null ? List.<IncomingLead>of() : body.leads()) {
            Lead l = new Lead();
            l.setJobId(job.getId());
            l.setName(in.name());
            l.setAddress(in.address());
            l.setPhone(in.phone());
            l.setRating(in.rating());
            l.setReviews(in.reviews());
            l.setWebsite(in.website());
            l.setEmails(in.emails() == null ? null : String.join(",", in.emails()));
            l.setScore(in.score());
            l.setReason(in.reason());
            l.setSubject(in.subject());
            l.setEmailBody(in.emailBody());
            leads.save(l);
        }
        job.setStatus(SearchJob.Status.DONE);
        jobs.save(job);
    }
}
