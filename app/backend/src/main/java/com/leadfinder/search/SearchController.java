package com.leadfinder.search;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/searches")
@RequiredArgsConstructor
public class SearchController {

    public record CreateSearch(@NotBlank String niche, @NotBlank String city,
                               @NotBlank String service, @NotBlank String sender) {}

    public record JobDto(Long id, String niche, String city, SearchJob.Status status, Instant createdAt) {
        static JobDto of(SearchJob j) {
            return new JobDto(j.getId(), j.getNiche(), j.getCity(), j.getStatus(), j.getCreatedAt());
        }
    }

    public record LeadDto(Long id, String name, String address, String phone, Double rating, Integer reviews,
                          String website, List<String> emails, Integer score, String reason,
                          String subject, String emailBody, String status) {
        static LeadDto of(Lead l) {
            List<String> emails = l.getEmails() == null || l.getEmails().isBlank()
                    ? List.of() : List.of(l.getEmails().split(","));
            return new LeadDto(l.getId(), l.getName(), l.getAddress(), l.getPhone(), l.getRating(), l.getReviews(),
                    l.getWebsite(), emails, l.getScore(), l.getReason(), l.getSubject(), l.getEmailBody(), l.getStatus());
        }
    }

    public record JobDetail(JobDto job, List<LeadDto> leads) {}

    private final SearchJobRepository jobs;
    private final LeadRepository leads;
    private final N8nClient n8n;

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public JobDto create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateSearch req) {
        SearchJob job = new SearchJob();
        job.setUserId(Long.valueOf(jwt.getSubject()));
        job.setNiche(req.niche());
        job.setCity(req.city());
        job.setService(req.service());
        job.setSender(req.sender());
        jobs.save(job);
        try {
            n8n.trigger(job);
        } catch (RuntimeException e) {
            log.error("Could not reach n8n for job {}", job.getId(), e);
            job.setStatus(SearchJob.Status.FAILED);
            jobs.save(job);
        }
        return JobDto.of(job);
    }

    @GetMapping
    public List<JobDto> list(@AuthenticationPrincipal Jwt jwt) {
        return jobs.findByUserIdOrderByCreatedAtDesc(Long.valueOf(jwt.getSubject())).stream().map(JobDto::of).toList();
    }

    @GetMapping("/{id}")
    public JobDetail get(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        SearchJob job = jobs.findByIdAndUserId(id, Long.valueOf(jwt.getSubject()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return new JobDetail(JobDto.of(job), leads.findByJobIdOrderByScoreDesc(id).stream().map(LeadDto::of).toList());
    }
}
