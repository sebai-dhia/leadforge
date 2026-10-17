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
                .expiresAt(now.plus(Duration.ofHours(12)))
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String token = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        if (!u.isAdmin()) {
            sessionRegistry.registerSession(sessionId, u.getId());
        }
        return token;
    }
}
