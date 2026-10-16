package com.leadfinder.search;

import java.util.List;

public record LeadDto(Long id, String name, String address, String phone, Double rating, Integer reviews,
                      String website, List<String> emails, Integer score, String reason,
                      String subject, String emailBody, String status,
                      String draftLanguage, String draftChannel) {

    public static LeadDto of(Lead l) {
        List<String> emails = l.getEmails() == null || l.getEmails().isBlank()
                ? List.of() : List.of(l.getEmails().split(","));
        return new LeadDto(l.getId(), l.getName(), l.getAddress(), l.getPhone(), l.getRating(), l.getReviews(),
                l.getWebsite(), emails, l.getScore(), l.getReason(), l.getSubject(), l.getEmailBody(),
                l.getStatus(), l.getDraftLanguage(), l.getDraftChannel());
    }
}
