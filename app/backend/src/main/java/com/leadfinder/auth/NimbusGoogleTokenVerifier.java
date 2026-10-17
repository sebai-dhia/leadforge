package com.leadfinder.auth;

import com.leadfinder.config.AppProperties;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;

import java.util.List;

/** Verifies Google ID tokens against Google's published signing keys. No client secret is involved. */
@Component
public class NimbusGoogleTokenVerifier implements GoogleTokenVerifier {

    private static final String JWKS = "https://www.googleapis.com/oauth2/v3/certs";
    private static final List<String> ISSUERS = List.of("https://accounts.google.com", "accounts.google.com");

    private final NimbusJwtDecoder decoder;

    public NimbusGoogleTokenVerifier(AppProperties props) {
        String clientId = props.google() == null ? "" : props.google().clientId();
        OAuth2TokenValidator<Jwt> issuer = jwt -> ISSUERS.contains(jwt.getIssuer() == null ? "" : jwt.getIssuer().toString())
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Wrong issuer", null));
        OAuth2TokenValidator<Jwt> audience = jwt -> clientId != null && !clientId.isBlank() && jwt.getAudience().contains(clientId)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Token is for another application", null));
        decoder = NimbusJwtDecoder.withJwkSetUri(JWKS).build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(new JwtTimestampValidator(), issuer, audience));
    }

    @Override
    public GoogleIdentity verify(String idToken) {
        try {
            Jwt jwt = decoder.decode(idToken);
            String email = jwt.getClaimAsString("email");
            if (jwt.getSubject() == null || email == null) throw new IllegalArgumentException("Token has no email");
            return new GoogleIdentity(jwt.getSubject(), email.trim().toLowerCase(),
                    Boolean.TRUE.equals(jwt.getClaimAsBoolean("email_verified")), jwt.getClaimAsString("name"));
        } catch (JwtException e) {
            throw new IllegalArgumentException("Invalid Google token", e);
        }
    }
}
