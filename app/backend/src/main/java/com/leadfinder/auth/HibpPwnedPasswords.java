package com.leadfinder.auth;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;

/**
 * Have I Been Pwned, range search: only the first 5 characters of the password's SHA-1 leave the server
 * (k-anonymity), and the answer lists the leaked hashes that start with them. Free, no key.
 */
@Slf4j
@Component
public class HibpPwnedPasswords implements PwnedPasswords {

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    @Override
    public boolean isPwned(String password) {
        try {
            String sha1 = HexFormat.of().withUpperCase()
                    .formatHex(MessageDigest.getInstance("SHA-1").digest(password.getBytes(StandardCharsets.UTF_8)));
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.pwnedpasswords.com/range/" + sha1.substring(0, 5)))
                    .timeout(Duration.ofSeconds(4))
                    .header("Add-Padding", "true")
                    .header("User-Agent", "Leadforge")
                    .GET().build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Leaked-password check unavailable (HTTP {}); password accepted", response.statusCode());
                return false;
            }
            String suffix = sha1.substring(5);
            // each line: the rest of a leaked hash, then how often it was seen (padding lines have a count of 0)
            return response.body().lines().anyMatch(line -> line.startsWith(suffix + ":") && !line.endsWith(":0"));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (Exception e) {
            log.warn("Leaked-password check failed ({}); password accepted", e.toString());
            return false;
        }
    }
}
