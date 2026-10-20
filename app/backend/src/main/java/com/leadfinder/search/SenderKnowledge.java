package com.leadfinder.search;

import com.leadfinder.auth.AppUser;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;

/**
 * The text read from a person's own links, cached on their account. It belongs to one exact set of links
 * (the hash) and is read again after a week, so changes on their pages are picked up.
 */
public final class SenderKnowledge {
    static final Duration MAX_AGE = Duration.ofDays(7);

    private SenderKnowledge() {}

    /** Identifies the person's current links, or "" when they have none. */
    public static String hashOf(AppUser u) {
        String links = u.getLinks() == null ? "" : u.getLinks().strip();
        if (links.isEmpty() || links.equals("[]")) return "";
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(links.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** The cached text when it is for the current links and not too old, otherwise null. */
    public static String fresh(AppUser u, String currentHash) {
        if (currentHash.isEmpty() || u.getLinksKnowledge() == null || u.getLinksKnowledgeAt() == null) return null;
        if (!currentHash.equals(u.getLinksKnowledgeHash())) return null;
        if (u.getLinksKnowledgeAt().isBefore(Instant.now().minus(MAX_AGE))) return null;
        return u.getLinksKnowledge();
    }

    /** Keeps what n8n read, unless the person changed their links while it was reading. */
    public static boolean store(AppUser u, String currentHash, String sentHash, String text) {
        if (text == null || text.isBlank() || currentHash.isEmpty() || !currentHash.equals(sentHash)) return false;
        u.setLinksKnowledge(text.length() > 4000 ? text.substring(0, 4000) : text);
        u.setLinksKnowledgeHash(currentHash);
        u.setLinksKnowledgeAt(Instant.now());
        return true;
    }
}
