package com.leadfinder.auth;

import com.leadfinder.config.AppProperties;
import com.leadfinder.settings.RuntimeSettings;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    public record Credentials(@Email @NotBlank String email, @NotBlank @Size(min = 8, max = 100) String password) {}

    public record GuestRequest(@Size(max = 20) String specialization) {}

    public record GoogleLogin(@NotBlank @Size(max = 4096) String credential) {}

    public record GoogleLink(@NotBlank @Size(max = 4096) String credential, @NotBlank @Size(max = 100) String password) {}

    public record TokenResponse(String token, String email, String role, boolean isDemo, boolean onboarded) {}

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final TokenService tokens;
    private final AuthThrottle throttle;
    private final ActiveSessionRegistry sessionRegistry;
    private final AppProperties props;
    private final RuntimeSettings settings;
    private final GoogleTokenVerifier googleVerifier;
    private volatile String dummyHash;

    @GetMapping("/demo-status")
    public ActiveSessionRegistry.DemoStatus demoStatus() {
        return sessionRegistry.getStatus();
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public TokenResponse register(@Valid @RequestBody Credentials c, HttpServletRequest request) {
        if (settings.demo() != null && !settings.demo().allowRegistration()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Public registration is disabled in demo mode");
        }
        throttle.checkAndRecordRegister(request.getRemoteAddr());
        String email = c.email().trim().toLowerCase();
        if (users.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered");
        }
        AppUser u = new AppUser();
        u.setEmail(email);
        u.setPasswordHash(encoder.encode(c.password()));
        users.save(u);
        return new TokenResponse(tokens.issue(u), u.getEmail(), u.getRole(), u.isDemo(), u.isOnboarded());
    }

    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody Credentials c, HttpServletRequest request) {
        String ip = request.getRemoteAddr();
        String email = c.email().trim().toLowerCase();
        throttle.checkLogin(ip, email);
        AppUser found = users.findByEmail(email).orElse(null);
        AppUser u = passwordMatches(found, c.password()) ? found : null;
        if (u == null) {
            throttle.recordLoginFailure(ip, email);
            // the same answer for every failure, so the response does not tell whether an email has an account
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        requireFreeSeat(u);
        throttle.clearLogin(ip, email);
        return new TokenResponse(tokens.issue(u), u.getEmail(), u.getRole(), u.isDemo(), u.isOnboarded());
    }

    /**
     * Signs in with a Google ID token, creating the account on first use. An existing password account with the
     * same email is never linked automatically: registration does not prove ownership of the address, so
     * linking could hand the account to whoever registered first.
     */
    @PostMapping("/google")
    public TokenResponse google(@Valid @RequestBody GoogleLogin body, HttpServletRequest request) {
        if (props.google() == null || props.google().clientId() == null || props.google().clientId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Google sign-in is not enabled");
        }
        GoogleTokenVerifier.GoogleIdentity id;
        try {
            id = googleVerifier.verify(body.credential());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Google sign-in could not be verified");
        }
        if (!id.emailVerified()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Your Google email address is not verified");
        }
        String email = id.email().trim().toLowerCase();
        AppUser u = users.findByGoogleSub(id.sub()).orElse(null);
        if (u == null) {
            if (users.existsByEmail(email)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "An account with this email already exists. Sign in with its password instead.");
            }
            requireFreeSeatForNewUser();
            throttle.checkAndRecordRegister(request.getRemoteAddr());
            u = new AppUser();
            u.setEmail(email);
            u.setGoogleSub(id.sub());
            u.setRole("USER");
            u.setDisplayName(id.name() == null ? "" : id.name().trim());
            users.save(u);
        } else {
            requireFreeSeat(u);
        }
        return new TokenResponse(tokens.issue(u), u.getEmail(), u.getRole(), u.isDemo(), u.isOnboarded());
    }

    /**
     * Connects a Google identity to an existing password account. Both proofs are needed: a valid Google token whose
     * verified email is the account's email, and the account's password. Anyone who only registered the address
     * (without owning it) cannot pass the Google check, and anyone with only the Google login cannot pass the password check.
     */
    @PostMapping("/google/link")
    public TokenResponse linkGoogle(@Valid @RequestBody GoogleLink body, HttpServletRequest request) {
        if (props.google() == null || props.google().clientId() == null || props.google().clientId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Google sign-in is not enabled");
        }
        GoogleTokenVerifier.GoogleIdentity id;
        try {
            id = googleVerifier.verify(body.credential());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Google sign-in could not be verified");
        }
        if (!id.emailVerified()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Your Google email address is not verified");
        }
        String ip = request.getRemoteAddr();
        String email = id.email().trim().toLowerCase();
        throttle.checkLogin(ip, email);
        AppUser candidate = users.findByEmail(email).orElse(null);
        AppUser u = passwordMatches(candidate, body.password()) ? candidate : null;
        if (u == null) {
            throttle.recordLoginFailure(ip, email);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        AppUser other = users.findByGoogleSub(id.sub()).orElse(null);
        if ((other != null && !other.getId().equals(u.getId())) || (u.getGoogleSub() != null && !u.getGoogleSub().equals(id.sub()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This account is connected to another Google account");
        }
        requireFreeSeat(u);
        u.setGoogleSub(id.sub());
        users.save(u);
        throttle.clearLogin(ip, email);
        return new TokenResponse(tokens.issue(u), u.getEmail(), u.getRole(), u.isDemo(), u.isOnboarded());
    }

    /** One click, no form: a private temporary account that is deleted after a short idle time. */
    @PostMapping("/guest")
    public TokenResponse guest(@RequestBody(required = false) GuestRequest body, HttpServletRequest request) {
        if (settings.guest() == null || !settings.guest().enabled()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Guest access is not enabled");
        }
        Specialization spec;
        try {
            spec = Specialization.parse(body == null ? null : body.specialization());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown specialization");
        }
        requireFreeSeatForNewUser();
        throttle.checkAndRecordGuest(request.getRemoteAddr());
        AppUser u = new AppUser();
        u.setEmail("guest-" + java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 12) + "@guest.leadforge.local");
        u.setRole("GUEST");
        u.setOnboarded(true); // a guest starts straight away with a default offer
        u.setDisplayName("Guest");
        spec.apply(u);
        users.save(u);
        return new TokenResponse(tokens.issue(u), u.getEmail(), u.getRole(), u.isDemo(), u.isOnboarded());
    }

    /** Revokes the caller's token on the server, so a copied token stops working at once. Always succeeds. */
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@AuthenticationPrincipal Jwt jwt) {
        if (jwt != null) sessionRegistry.revokeSession(jwt.getClaimAsString("sid"));
    }

    /**
     * Always runs one BCrypt check, against a throw-away hash when there is no usable password, so an unknown email
     * and a wrong password take the same time to answer.
     */
    private boolean passwordMatches(AppUser user, String password) {
        boolean usable = user != null && user.getPasswordHash() != null;
        boolean ok = encoder.matches(password, usable ? user.getPasswordHash() : dummyHash());
        return usable && ok;
    }

    private String dummyHash() {
        String h = dummyHash;
        if (h == null) dummyHash = h = encoder.encode(java.util.UUID.randomUUID().toString());
        return h;
    }

    private void requireFreeSeat(AppUser u) {
        if (!u.isAdmin() && !sessionRegistry.canAcceptVisitor()) full();
    }

    private void requireFreeSeatForNewUser() {
        if (!sessionRegistry.canAcceptVisitor()) full();
    }

    private void full() {
        throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "Demo is currently full (5 active sessions). Please try again in a few minutes.");
    }
}
