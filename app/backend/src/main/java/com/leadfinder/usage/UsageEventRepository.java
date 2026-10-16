package com.leadfinder.usage;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;

public interface UsageEventRepository extends JpaRepository<UsageEvent, Long> {
    long countByUserIdAndKindAndCreatedAtAfter(Long userId, String kind, Instant since);
}
