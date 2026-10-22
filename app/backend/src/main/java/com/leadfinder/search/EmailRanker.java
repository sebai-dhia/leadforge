package com.leadfinder.search;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Orders the emails found for a business so the first one is the one worth writing to.
 * Pages are full of addresses that are useless for outreach (privacy officers, no-reply senders,
 * website-builder placeholders), so those are dropped or pushed to the end.
 */
final class EmailRanker {
    private static final Pattern VALID = Pattern.compile("^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\\.[a-z]{2,24}$");

    /** Not a real inbox: senders that never read replies, and template placeholders. */
    private static final Pattern JUNK_LOCAL = Pattern.compile(
            "^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|abuse|webmaster|hostmaster|root|"
                    + "votre[-._]?(adresse|email|mail|nom)|ton[-._]?(adresse|email)|(your|my)[-._]?(email|address|mail)|adresse|exemple|example|prenom[-._]?nom|nom[-._]?prenom|"
                    + "unsubscribe|bounces?|newsletter|you|your-?name|name|user|username|email|mail|test|sample|john\\.?doe)$");

    private static final Set<String> JUNK_DOMAINS = Set.of(
            "example.com", "example.org", "example.net", "domain.com", "email.com", "yourdomain.com", "mysite.com",
            "site.com", "sentry.io", "wixpress.com", "wix.com", "squarespace.com", "godaddy.com", "wordpress.com",
            "wp.com", "gravatar.com", "jquery.com", "fontawesome.com", "schema.org", "w3.org", "google.com",
            "googleapis.com", "gstatic.com", "facebook.com", "fb.com", "cloudflare.com", "shopify.com",
            "mailchimp.com", "apple.com", "bootstrapcdn.com");

    private static final Set<String> FILE_ENDINGS = Set.of(
            "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "css", "js", "woff", "woff2", "ttf", "pdf");

    /** Privacy officers and legal departments: real addresses, but not who you pitch to. */
    private static final Pattern PRIVACY_LOCAL = Pattern.compile(
            "datenschutz|privacy|dpo|gdpr|rgpd|legal|compliance|dataprotection|data-protection|protection");

    /** The inboxes a small business actually reads for enquiries and bookings. */
    private static final Pattern BUSINESS_LOCAL = Pattern.compile(
            "^(contacts?|infos?|information|hello|bonjour|hi|sales|commercial|ventes?|bookings?|reservations?|"
                    + "reserv|rdv|appointments?|accueil|reception|office|bureau|admin|administration|direction|"
                    + "manager|management|cabinet|clinique|agence|secretariat|secretary)$");

    private static final Pattern SUPPORT_LOCAL = Pattern.compile("^(support|services?|help|customers?|sav|assistance)$");

    private static final Set<String> FREE_MAIL = Set.of(
            "gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com", "hotmail.fr", "outlook.com",
            "outlook.fr", "live.com", "live.fr", "icloud.com", "msn.com", "protonmail.com", "proton.me",
            "topnet.tn", "planet.tn", "gnet.tn", "tunet.tn");

    private EmailRanker() {}

    /** Valid, de-duplicated emails, best first. Junk is removed. */
    static List<String> rank(List<String> emails, String websiteHost) {
        Set<String> seen = new LinkedHashSet<>();
        for (String e : emails) {
            if (e == null) continue;
            String clean = e.trim().toLowerCase(Locale.ROOT);
            if (isUsable(clean)) seen.add(clean);
        }
        List<String> out = new ArrayList<>(seen);
        out.sort(Comparator.comparingInt((String e) -> priority(e, websiteHost)).reversed()); // stable sort: emails with the same score keep the order they had on the page
        return out;
    }

    static boolean isUsable(String email) {
        if (!VALID.matcher(email).matches()) return false;
        int at = email.indexOf('@');
        String local = email.substring(0, at);
        String domain = email.substring(at + 1);
        String tld = domain.substring(domain.lastIndexOf('.') + 1);
        if (FILE_ENDINGS.contains(tld) || JUNK_LOCAL.matcher(local).matches()) return false;
        if (domain.startsWith(".") || domain.contains("..")) return false;
        return JUNK_DOMAINS.stream().noneMatch(d -> domain.equals(d) || domain.endsWith("." + d));
    }

    static int priority(String email, String websiteHost) {
        int at = email.indexOf('@');
        String local = email.substring(0, at);
        String domain = email.substring(at + 1);

        int score;
        if (PRIVACY_LOCAL.matcher(local).find()) score = 0;
        else if (BUSINESS_LOCAL.matcher(local).matches()) score = 6;
        else if (SUPPORT_LOCAL.matcher(local).matches()) score = 3;
        else score = 4; // looks like a person: often the owner of a small business

        if (websiteHost != null && !websiteHost.isBlank()) {
            if (domain.equals(websiteHost) || domain.endsWith("." + websiteHost) || websiteHost.endsWith("." + domain)) {
                score += 3; // same organisation as the website
            } else if (FREE_MAIL.contains(domain)) {
                score += 1; // common for small businesses
            } else {
                score -= 2; // an address from somewhere else on the page
            }
        } else if (FREE_MAIL.contains(domain)) {
            score += 1;
        }
        return score;
    }
}
