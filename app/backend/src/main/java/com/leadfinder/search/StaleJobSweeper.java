package com.leadfinder.search;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/** Marks searches that never got a callback from n8n as FAILED so the UI stops waiting. */
@Slf4j
@Configuration
@EnableScheduling
@RequiredArgsConstructor
public class StaleJobSweeper {
    /** A search takes under a minute; four minutes without an answer means the workflow broke. */
    private static final Duration MAX_PENDING = Duration.ofMinutes(4);

    private final SearchJobRepository jobs;
    private final com.leadfinder.alert.AlertService alerts;

    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    @Transactional
    public void failStaleJobs() {
        List<SearchJob> stale = jobs.findByStatusAndCreatedAtBefore(
                SearchJob.Status.PENDING, Instant.now().minus(MAX_PENDING));
        stale.forEach(j -> {
            j.setStatus(SearchJob.Status.FAILED);
            j.setFailureReason("No result from the search workflow within " + MAX_PENDING.toMinutes() + " minutes");
        });
        if (!stale.isEmpty()) {
            log.warn("Marked {} stale search job(s) as FAILED", stale.size());
            alerts.send("search-stuck", stale.size() + " search(es) got no result from n8n within " + MAX_PENDING.toMinutes()
                    + " minutes and were marked failed. Check the n8n executions. Jobs: "
                    + stale.stream().map(j -> String.valueOf(j.getId())).toList() + ".");
        }
    }
}
