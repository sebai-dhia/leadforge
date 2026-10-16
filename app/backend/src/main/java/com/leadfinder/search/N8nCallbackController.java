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

    public record Results(Long jobId, List<IncomingLead> leads) {}

    private final SearchJobRepository jobs;
    private final LeadService leadService;
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
        LeadService.IngestResult result = leadService.ingest(job, body.leads() == null ? List.of() : body.leads());
        job.setFoundCount(result.found());
        job.setNewCount(result.created());
        job.setStatus(SearchJob.Status.DONE);
        jobs.save(job);
    }
}
