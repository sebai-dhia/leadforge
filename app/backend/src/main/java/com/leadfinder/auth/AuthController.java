package com.leadfinder.auth;

import com.leadfinder.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    public record Credentials(@Email @NotBlank String email, @NotBlank @Size(min = 8, max = 100) String password) {}

    public record GuestRequest(@Size(max = 20) String specialization) {}

    public record GoogleLogin(@NotBlank @Size(max = 4096) String credential) {}

    public record TokenResponse(String token, String email, String role, boolean isDemo, boolean onboarded) {}

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final TokenService tokens;
    private final AuthThrottle throttle;
    private final ActiveSessionRegistry sessionRegistry;
    private final AppProperties props;
    private final GoogleTokenVerifier googleVerifier;

    @GetMapping("/demo-status")
    public ActiveSessionRegistry.DemoStatus demoStatus() {
        return sessionRegistry.getStatus();
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public TokenResponse register(@Valid @RequestBody Credentials c, HttpServletRequest request) {
        if (props.demo() != null && !props.demo().allowRegistration()) {
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
        AppUser u = users.findByEmail(email)
                .filter(x -> x.getPasswordHash() != null && encoder.matches(c.password(), x.getPasswordHash()))
                .orElse(null);
        if (u == null) {
            throttle.recordLoginFailure(ip, email);
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

    /** One click, no form: a private temporary account that is deleted after a short idle time. */
    @PostMapping("/guest")
    public TokenResponse guest(@RequestBody(required = false) GuestRequest body, HttpServletRequest request) {
        if (props.guest() == null || !props.guest().enabled()) {
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
