package com.leadfinder.search;

import com.leadfinder.auth.AppUser;
import com.leadfinder.auth.UserRepository;
import com.leadfinder.usage.UsageService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
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

    public record CreateSearch(
            @NotBlank @Size(max = 120) String niche,
            @Size(max = 250) String city,
            List<@Size(max = 120) String> cities,
            @Size(max = 100) String bbox
    ) {}

    public record JobDto(Long id, String niche, String city, String bbox, SearchJob.Status status, Instant createdAt,
                         Integer foundCount, Integer newCount) {
        static JobDto of(SearchJob j) {
            return new JobDto(j.getId(), j.getNiche(), j.getCity(), j.getBbox(), j.getStatus(), j.getCreatedAt(),
                    j.getFoundCount(), j.getNewCount());
        }
    }

    public record JobDetail(JobDto job, List<LeadDto> leads) {}

    private final SearchJobRepository jobs;
    private final LeadRepository leads;
    private final UserRepository users;
    private final N8nClient n8n;
    private final UsageService usage;
    private final NicheSuggestionService nicheSuggestions;

    @GetMapping("/suggested-niches")
    public List<String> suggestedNiches(@AuthenticationPrincipal Jwt jwt) {
        AppUser user = users.findById(Long.valueOf(jwt.getSubject()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        return nicheSuggestions.suggestFor(user.getOffer(),
                com.leadfinder.auth.ProfileController.ProfileDto.of(user).targets());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public JobDto create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateSearch req) {
        AppUser user = users.findById(Long.valueOf(jwt.getSubject()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (user.getOffer().isBlank() || user.getDisplayName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Complete your profile first");
        }

        String area = resolveAreaDescription(req);
        Long usageId = usage.consume(user.getId(), UsageService.Kind.SEARCH);

        SearchJob job = new SearchJob();
        job.setUserId(user.getId());
        job.setNiche(req.niche().trim());
        job.setCity(area);
        job.setBbox(req.bbox() != null && !req.bbox().isBlank() ? req.bbox().trim() : null);
        job.setService(user.getOffer());
        job.setSender(user.getDisplayName());
        jobs.save(job);

        try {
            n8n.trigger(job);
        } catch (RuntimeException e) {
            log.error("Could not reach n8n for job {}", job.getId(), e);
            job.setStatus(SearchJob.Status.FAILED);
            jobs.save(job);
            usage.refund(usageId);
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
        return new JobDetail(JobDto.of(job), leads.findByJob(id).stream().map(LeadDto::of).toList());
    }

    private String resolveAreaDescription(CreateSearch req) {
        if (req.cities() != null && !req.cities().isEmpty()) {
            List<String> clean = req.cities().stream()
                    .filter(c -> c != null && !c.isBlank())
                    .map(String::trim)
                    .limit(3)
                    .toList();
            if (!clean.isEmpty()) return String.join(" | ", clean); // the workflow splits on " | "
        }
        if (req.city() != null && !req.city().isBlank()) {
            return req.city().trim();
        }
        if (req.bbox() != null && !req.bbox().isBlank()) {
            return "Map Area [" + req.bbox().trim() + "]";
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "City, cities, or map area is required");
    }
}
