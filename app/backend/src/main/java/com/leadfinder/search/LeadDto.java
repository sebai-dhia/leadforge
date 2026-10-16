package com.leadfinder.search;

import java.time.Instant;
import java.util.List;

public record LeadDto(Long id, String name, String address, String phone, Double rating, Integer reviews,
                      String website, List<String> emails, Integer score, String reason,
                      String subject, String emailBody, String status,
                      String draftLanguage, String draftChannel,
                      String niche, String city, Instant firstSeenAt, Instant lastSeenAt) {

    public static LeadDto of(Lead l) {
        List<String> emails = l.getEmails() == null || l.getEmails().isBlank()
                ? List.of() : List.of(l.getEmails().split(","));
        return new LeadDto(l.getId(), l.getName(), l.getAddress(), l.getPhone(), l.getRating(), l.getReviews(),
                l.getWebsite(), emails, l.getScore(), l.getReason(), l.getSubject(), l.getEmailBody(),
                l.getStatus(), l.getDraftLanguage(), l.getDraftChannel(),
                l.getNiche(), l.getCity(), l.getFirstSeenAt(), l.getLastSeenAt());
    }
}
