package com.leadfinder.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TokenService {
    static final Duration LIFETIME = Duration.ofHours(12);

    private final JwtEncoder encoder;
    private final ActiveSessionRegistry sessionRegistry;

    public String issue(AppUser u) {
        String sessionId = UUID.randomUUID().toString();
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(String.valueOf(u.getId()))
                .claim("email", u.getEmail())
                .claim("role", u.getRole())
                .claim("isDemo", u.isDemo())
                .claim("sid", sessionId)
                .issuedAt(now)
                .expiresAt(now.plus(LIFETIME))
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String token = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        // seats are for guests and shared demo accounts; people with their own account never take one
        if (!u.isAdmin() && (u.isDemo() || "GUEST".equals(u.getRole()))) {
            sessionRegistry.registerSession(sessionId, u.getId());
        }
        return token;
    }
}
