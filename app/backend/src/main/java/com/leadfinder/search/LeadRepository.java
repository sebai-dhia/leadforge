package com.leadfinder.search;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LeadRepository extends JpaRepository<Lead, Long> {
    List<Lead> findByJobIdOrderByScoreDesc(Long jobId);
}
