package com.leadfinder.search;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.regex.Pattern;

/** Builds an Excel-friendly CSV (UTF-8 with BOM so Arabic and French show correctly). */
final class LeadCsv {
    private static final String[] HEADER = {
            "Name", "Fit score", "Status", "Phone", "Emails", "Website", "Address", "Category", "City",
            "Why it fits", "First found", "Last found", "Message language", "Message channel", "Subject", "Message"};

    /** A leading + or - is fine for phone numbers, but not for anything that could be read as a formula. */
    private static final Pattern PHONE_LIKE = Pattern.compile("^[+-][\\d\\s().-]+$");

    private LeadCsv() {}

    static byte[] build(List<Lead> leads) {
        StringBuilder sb = new StringBuilder("﻿");
        row(sb, HEADER);
        for (Lead l : leads) {
            row(sb,
                    l.getName(), str(l.getScore()), l.getStatus(), l.getPhone(),
                    l.getEmails() == null ? "" : l.getEmails().replace(",", "; "),
                    l.getWebsite(), l.getAddress(), l.getNiche(), l.getCity(), l.getReasonText(),
                    str(l.getFirstSeenAt()), str(l.getLastSeenAt()),
                    l.getDraftLanguage(), l.getDraftChannel(), l.getSubject(), l.getEmailBody());
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static void row(StringBuilder sb, String... cells) {
        for (int i = 0; i < cells.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(cell(cells[i]));
        }
        sb.append("\r\n");
    }

    static String cell(String value) {
        if (value == null) return "";
        String v = value;
        char first = v.isEmpty() ? ' ' : v.charAt(0);
        boolean risky = first == '=' || first == '@' || first == '\t' || first == '\r'
                || ((first == '+' || first == '-') && !PHONE_LIKE.matcher(v).matches());
        if (risky) v = "'" + v;
        if (v.contains(",") || v.contains("\"") || v.contains("\n") || v.contains("\r")) {
            v = "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString();
    }
}
