package com.leadfinder.search;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.leadfinder.search.XlsxWriter.CENTER;
import static com.leadfinder.search.XlsxWriter.DATE;
import static com.leadfinder.search.XlsxWriter.PLAIN;
import static com.leadfinder.search.XlsxWriter.WRAP;

/** The leads as an Excel file: readable labels in the user's language, in the order a lead is worked. */
final class LeadExport {
    static final String CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    /** The words in the file, per language. Anything but French reads in English. */
    private record Words(String sheet, String name, String score, String status, String phone, String emails, String website,
                         String maps, String openMaps, String rating, String reviews, String why, String address, String type,
                         String city, String firstFound, String lastFound, String language, String channel, String subject,
                         String message, String drawn, String drawnNear, String email,
                         String[] statuses, String[] languages) {}

    private static final Words EN = new Words("Leads", "Name", "Fit score", "Status", "Phone", "Emails", "Website",
            "Google Maps", "Open in Maps", "Rating", "Reviews", "Why it fits", "Address", "Business type", "City or area",
            "First found (UTC)", "Last found (UTC)", "Message language", "Message channel", "Subject", "Message",
            "Drawn map area", "%s (drawn area)", "Email",
            new String[]{"New", "Contacted", "Replied", "Not interested"}, new String[]{"English", "French", "Arabic"});

    private static final Words FR = new Words("Prospects", "Nom", "Score", "Statut", "Téléphone", "E-mails", "Site web",
            "Google Maps", "Ouvrir dans Maps", "Note", "Avis", "Pourquoi il convient", "Adresse", "Type d'activité", "Ville ou zone",
            "Trouvé le (UTC)", "Dernière fois (UTC)", "Langue du message", "Canal du message", "Objet", "Message",
            "Zone dessinée sur la carte", "%s (zone dessinée)", "E-mail",
            new String[]{"Nouveau", "Contacté", "Réponse reçue", "Pas intéressé"}, new String[]{"Anglais", "Français", "Arabe"});

    private static final Pattern DRAWN_AREA = Pattern.compile("^map area(?::\\s*([^\\[]+?))?\\s*(\\[|$)", Pattern.CASE_INSENSITIVE);
    private static final String[] STATUS_ORDER = {"NEW", "CONTACTED", "REPLIED", "NOT_INTERESTED"};
    private static final String[] LANGUAGE_ORDER = {"en", "fr", "ar"};

    private LeadExport() {}

    static byte[] build(List<Lead> leads, String lang) {
        Words w = "fr".equalsIgnoreCase(lang) ? FR : EN;
        XlsxWriter x = new XlsxWriter(w.sheet(), List.of(
                new XlsxWriter.Column(w.name(), 32, WRAP),
                new XlsxWriter.Column(w.score(), 9, CENTER),
                new XlsxWriter.Column(w.status(), 15, PLAIN),
                new XlsxWriter.Column(w.phone(), 19, PLAIN),
                new XlsxWriter.Column(w.emails(), 30, WRAP),
                new XlsxWriter.Column(w.website(), 30, PLAIN),
                new XlsxWriter.Column(w.maps(), 16, PLAIN),
                new XlsxWriter.Column(w.rating(), 8, CENTER),
                new XlsxWriter.Column(w.reviews(), 9, CENTER),
                new XlsxWriter.Column(w.why(), 60, WRAP),
                new XlsxWriter.Column(w.address(), 36, WRAP),
                new XlsxWriter.Column(w.type(), 20, WRAP),
                new XlsxWriter.Column(w.city(), 22, WRAP),
                new XlsxWriter.Column(w.firstFound(), 18, DATE),
                new XlsxWriter.Column(w.lastFound(), 18, DATE),
                new XlsxWriter.Column(w.language(), 13, PLAIN),
                new XlsxWriter.Column(w.channel(), 13, PLAIN),
                new XlsxWriter.Column(w.subject(), 40, WRAP),
                new XlsxWriter.Column(w.message(), 80, WRAP)));
        for (Lead l : leads) {
            x.addRow(l.getName(), l.getScore(), label(l.getStatus(), STATUS_ORDER, w.statuses()), l.getPhone(),
                    l.getEmails() == null ? null : l.getEmails().replace(",", "; "),
                    l.getWebsite() == null || l.getWebsite().isBlank() ? null : new XlsxWriter.Link(l.getWebsite(), l.getWebsite()),
                    mapsLink(l.getPlaceId(), w.openMaps()), l.getRating(), l.getReviews(), l.getReasonText(), l.getAddress(),
                    l.getNiche(), area(l.getCity(), w), l.getFirstSeenAt(), l.getLastSeenAt(),
                    label(l.getDraftLanguage(), LANGUAGE_ORDER, w.languages()), channel(l.getDraftChannel(), w),
                    l.getSubject(), l.getEmailBody());
        }
        return x.toBytes();
    }

    /** "2026-10-21-leadforge-dental-clinics-sousse.xlsx": the date first, so files sort by day, then the business type and the place when every lead shares them. */
    static String fileName(List<Lead> leads, LocalDate day) {
        Set<String> types = new LinkedHashSet<>(), cities = new LinkedHashSet<>();
        for (Lead l : leads) {
            if (l.getNiche() != null && !l.getNiche().isBlank()) types.add(l.getNiche().trim());
            String city = area(l.getCity(), EN);
            if (city != null) cities.add(city);
        }
        StringBuilder name = new StringBuilder(day.toString()).append("-leadforge");
        if (types.size() == 1) name.append('-').append(slug(types.iterator().next()));
        if (cities.size() == 1) name.append('-').append(slug(cities.iterator().next()));
        if (types.size() != 1 && cities.size() != 1) name.append("-leads");
        return name.append(".xlsx").toString();
    }

    /** A drawn rectangle is stored with its coordinates; the file shows a readable place instead. */
    private static String area(String city, Words w) {
        if (city == null || city.isBlank()) return null;
        Matcher m = DRAWN_AREA.matcher(city.trim());
        if (m.find()) return m.group(1) != null ? w.drawnNear().formatted(m.group(1).trim()) : w.drawn();
        return city.trim().replaceAll("\\s*\\|\\s*", ", ");
    }

    private static XlsxWriter.Link mapsLink(String placeId, String text) {
        if (placeId == null || placeId.isBlank()) return null;
        return new XlsxWriter.Link(text, "https://www.google.com/maps/place/?q=place_id:" + URLEncoder.encode(placeId, StandardCharsets.UTF_8));
    }

    private static String label(String code, String[] codes, String[] labels) {
        if (code == null || code.isBlank()) return null;
        for (int i = 0; i < codes.length; i++) if (codes[i].equalsIgnoreCase(code)) return labels[i];
        return code;
    }

    private static String channel(String code, Words w) {
        if (code == null || code.isBlank()) return null;
        return switch (code.toLowerCase()) {
            case "email" -> w.email();
            case "whatsapp" -> "WhatsApp";
            default -> code;
        };
    }

    static String slug(String s) {
        String ascii = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        String slug = ascii.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (slug.length() > 40) slug = slug.substring(0, 40).replaceAll("-+$", "");
        return slug.isEmpty() ? "leads" : slug;
    }
}
