package com.leadfinder.search;

import org.springframework.data.jpa.repository.JpaRepository;

public interface LeadBlockRepository extends JpaRepository<LeadBlock, Long> {
    boolean existsByUserIdAndPlaceId(Long userId, String placeId);

    boolean existsByUserIdAndPhoneKey(Long userId, String phoneKey);

    boolean existsByUserIdAndWebsiteHost(Long userId, String websiteHost);
}
