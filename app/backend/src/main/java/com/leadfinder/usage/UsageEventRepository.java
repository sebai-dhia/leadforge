package com.leadfinder.usage;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;

public interface UsageEventRepository extends JpaRepository<UsageEvent, Long> {
    long countByUserIdAndKindAndRefundedFalseAndCreatedAtAfter(Long userId, String kind, Instant since);

    long countByKindAndRefundedFalseAndCreatedAtAfter(String kind, Instant since);
}
