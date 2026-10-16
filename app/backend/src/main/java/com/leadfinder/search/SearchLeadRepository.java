package com.leadfinder.search;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SearchLeadRepository extends JpaRepository<SearchLead, SearchLead.Key> {
}
