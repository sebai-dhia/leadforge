package com.leadfinder.search;

import java.time.Instant;
import java.util.List;

public record LeadDto(Long id, String name, String address, String phone, Double rating, Integer reviews,
                      String website, List<String> emails, List<String> social, Integer score, String reason,
                      String subject, String emailBody, String status,
                      String draftLanguage, String draftChannel,
                      String niche, String city, Instant firstSeenAt, Instant lastSeenAt, Instant contactCheckedAt,
                      boolean hidden) {

    public static LeadDto of(Lead l) {
        return new LeadDto(l.getId(), l.getName(), l.getAddress(), l.getPhone(), l.getRating(), l.getReviews(),
                l.getWebsite(), LeadService.split(l.getEmails()), LeadService.split(l.getSocial()),
                l.getScore(), l.getReason(), l.getSubject(), l.getEmailBody(),
                l.getStatus(), l.getDraftLanguage(), l.getDraftChannel(),
                l.getNiche(), l.getCity(), l.getFirstSeenAt(), l.getLastSeenAt(), l.getContactCheckedAt(),
                l.getHiddenAt() != null);
    }
}
