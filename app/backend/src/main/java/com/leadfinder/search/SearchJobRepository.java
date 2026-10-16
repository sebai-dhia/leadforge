package com.leadfinder.search;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface SearchJobRepository extends JpaRepository<SearchJob, Long> {
    List<SearchJob> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<SearchJob> findByIdAndUserId(Long id, Long userId);

    List<SearchJob> findByStatusAndCreatedAtBefore(SearchJob.Status status, Instant before);
}
