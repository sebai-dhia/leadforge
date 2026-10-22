package com.leadfinder.telegram;

import com.leadfinder.search.Lead;

import java.util.List;

/** What the bot writes, in English or French (Telegram HTML: only &lt;b&gt; and &lt;a&gt; are used). */
final class TelegramText {
    private TelegramText() {}

    /** At most this many businesses per group; the rest are counted. */
    static final int MAX_LISTED = 10;

    static boolean fr(String lang) {
        return "fr".equals(lang);
    }

    static String connected(String lang) {
        return fr(lang)
                ? "✅ <b>Telegram est connecté à Leadforge.</b>\nChaque jour, je vous écris quand des entreprises que vous avez contactées n'ont pas répondu après 3 jours, puis après une semaine.\nEnvoyez /stop pour arrêter."
                : "✅ <b>Telegram is connected to Leadforge.</b>\nEach day, I'll message you when businesses you contacted haven't replied after 3 days, and again after a week.\nSend /stop to turn this off.";
    }

    static String linkExpired(String lang) {
        return fr(lang)
                ? "Ce lien a expiré ou a déjà servi. Dans Leadforge, ouvrez votre profil et appuyez de nouveau sur « Connecter Telegram »."
                : "This link has expired or was already used. In Leadforge, open your profile and press \"Connect Telegram\" again.";
    }

    static String stopped(String lang) {
        return fr(lang)
                ? "Telegram est déconnecté de Leadforge. Vous ne recevrez plus de messages ici."
                : "Telegram is disconnected from Leadforge. You won't get messages here any more.";
    }

    static String help(String lang, boolean connected) {
        if (connected) {
            return fr(lang)
                    ? "Je vous rappelle seulement les relances à faire, une fois par jour. Envoyez /stop pour me déconnecter."
                    : "I only remind you of follow-ups, once a day. Send /stop to disconnect me.";
        }
        return "To connect, open your profile in Leadforge and press \"Connect Telegram\".\n"
                + "Pour vous connecter, ouvrez votre profil dans Leadforge et appuyez sur « Connecter Telegram ».";
    }

    /**
     * The morning reminder: businesses marked Contacted 3 days ago, then a week ago (the last reminder for them).
     * appUrl is empty when the app has no public address.
     */
    static String followUp(String lang, List<Lead> threeDays, List<Lead> aWeek, String appUrl) {
        boolean fr = fr(lang);
        StringBuilder s = new StringBuilder();
        s.append(fr ? "🔔 <b>Relances à faire</b>\n" : "🔔 <b>Time to follow up</b>\n");
        s.append(fr ? "Ces entreprises n'ont pas encore répondu." : "These businesses haven't replied yet.");
        group(s, fr ? "Contactées il y a 3 jours" : "Contacted 3 days ago", threeDays, fr);
        group(s, fr ? "Contactées il y a une semaine (dernier rappel)" : "Contacted a week ago (last reminder)", aWeek, fr);
        s.append("\n\n").append(fr ? "Une réponse ? Passez le prospect en « Réponse reçue » dans Leadforge pour qu'il sorte de la liste."
                : "Got a reply? Mark the lead Replied in Leadforge so it leaves this list.");
        if (!appUrl.isEmpty()) {
            s.append("\n<a href=\"").append(esc(appUrl)).append("/leads?status=CONTACTED\">")
                    .append(fr ? "Ouvrir mes prospects contactés" : "Open my contacted leads").append("</a>");
        }
        return s.toString();
    }

    /** First line of the admin's sample reminder, so nobody mistakes it for real work. */
    static String testBanner(String lang) {
        return fr(lang) ? "🧪 <b>Test</b> : ceci est un exemple, rien à faire.\n\n" : "🧪 <b>Test</b>: this is a sample, nothing to do.\n\n";
    }

    private static void group(StringBuilder s, String title, List<Lead> leads, boolean fr) {
        if (leads.isEmpty()) return;
        s.append("\n\n<b>").append(title).append("</b>");
        for (Lead l : leads.subList(0, Math.min(MAX_LISTED, leads.size()))) {
            s.append("\n• <b>").append(esc(l.getName())).append("</b>");
            String channel = channel(l.getDraftChannel(), fr);
            if (channel != null) s.append(" · ").append(channel);
            String contact = contact(l, l.getDraftChannel());
            if (contact != null) s.append(" · ").append(esc(contact));
        }
        if (leads.size() > MAX_LISTED) {
            int more = leads.size() - MAX_LISTED;
            s.append("\n").append(fr ? "et " + more + " de plus" : "and " + more + " more");
        }
    }

    /** How the message was sent, when it was written in the app. */
    private static String channel(String code, boolean fr) {
        if ("whatsapp".equalsIgnoreCase(code)) return "WhatsApp";
        if ("email".equalsIgnoreCase(code)) return fr ? "e-mail" : "email";
        return null;
    }

    /** The contact on the channel used: the email for an email, otherwise the phone first. */
    private static String contact(Lead l, String channel) {
        String email = notBlank(l.getEmails()) ? l.getEmails().split(",")[0].trim() : null;
        String phone = notBlank(l.getPhone()) ? l.getPhone().trim() : null;
        if ("email".equalsIgnoreCase(channel) && email != null) return email;
        return phone != null ? phone : email;
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    static String esc(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
