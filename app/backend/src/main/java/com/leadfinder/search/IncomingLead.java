package com.leadfinder.search;

import java.util.List;

/** One business as reported by the n8n search workflow. */
public record IncomingLead(String placeId, String name, String address, String phone, Double rating, Integer reviews,
                           String website, List<String> emails, List<String> social, Integer score, String reason) {}
