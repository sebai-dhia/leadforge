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

import java.util.Map;

/**
 * Accounts are created only through Google (its verified email proves the address belongs to the person), and the
 * person then chooses a password, so they can sign in either way. A forgotten password is replaced the same way:
 * a Google sign-in with the account's address, then a new password. Nothing needs an email to be sent.
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    public record Credentials(@Email @NotBlank String email, @NotBlank @Size(min = 8, max = 100) String password) {}

    public record GuestRequest(@Size(max = 20) String specialization) {}

    public record GoogleLogin(@NotBlank @Size(max = 4096) String credential) {}

    public record GoogleLink(@NotBlank @Size(max = 4096) String credential, @NotBlank @Size(max = 100) String password) {}

    /** ticket: what a Google sign-in returned when a password has to be chosen. */
    public record NewPassword(@NotBlank @Size(max = 100) String ticket, @NotBlank @Size(max = 200) String password) {}

    public record CurrentPassword(@NotBlank @Size(max = 100) String currentPassword) {}

    public record PasswordChange(@NotBlank @Size(max = 100) String currentPassword, @NotBlank @Size(max = 200) String newPassword) {}

    /**
     * Either a session (token), or, after a Google sign-in, a passwordTicket: the account is created or its password
     * set only once the person has chosen one (POST /google/password).
     */
    public record TokenResponse(String token, String email, String role, boolean isDemo, boolean onboarded, String passwordTicket) {
    }

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final TokenService tokens;
    private final AuthThrottle throttle;
    private final ActiveSessionRegistry sessionRegistry;
    private final AppProperties props;
    private final RuntimeSettings settings;
    private final GoogleTokenVerifier googleVerifier;
    private final PasswordTickets tickets;
    private final PasswordPolicy policy;
    private volatile String dummyHash;

    @GetMapping("/demo-status")
    public ActiveSessionRegistry.DemoStatus demoStatus() {
        return sessionRegistry.getStatus();
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
        return session(u);
    }

    /**
     * Signs in with a Google ID token. A known Google account with a password gets a session. Otherwise a ticket: a
     * new account, or one created before passwords were asked for, needs a password first. An existing password
     * account with the same email is never linked here (see /google/link): it needs its password too.
     */
    @PostMapping("/google")
    public TokenResponse google(@Valid @RequestBody GoogleLogin body) {
        GoogleTokenVerifier.GoogleIdentity id = verifiedGoogle(body.credential(), HttpStatus.UNAUTHORIZED);
        String email = id.email().trim().toLowerCase();
        AppUser u = users.findByGoogleSub(id.sub()).orElse(null);
        if (u != null) {
            requireFreeSeat(u);
            if (u.getPasswordHash() == null) return ticket(PasswordTickets.Purpose.SET, id, email, u.getId());
            return session(u);
        }
        if (users.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "An account with this email already exists. Sign in with its password instead.");
        }
        return ticket(PasswordTickets.Purpose.CREATE, id, email, null);
    }

    /**
     * Forgotten password: a Google sign-in whose verified email is the account's address proves it belongs to the
     * person. Answers with a ticket for the new password (POST /google/password).
     */
    @PostMapping("/google/reset")
    public TokenResponse googleReset(@Valid @RequestBody GoogleLogin body) {
        GoogleTokenVerifier.GoogleIdentity id = verifiedGoogle(body.credential(), HttpStatus.UNAUTHORIZED);
        String email = id.email().trim().toLowerCase();
        AppUser u = users.findByGoogleSub(id.sub())
                .or(() -> users.findByEmail(email).filter(x -> x.getGoogleSub() == null))
                .orElse(null);
        if (u == null || u.isDemo() || "GUEST".equals(u.getRole())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No account uses this Google address");
        }
        if (u.getGoogleSub() != null && !u.getGoogleSub().equals(id.sub())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This account is connected to another Google account");
        }
        return ticket(PasswordTickets.Purpose.RESET, id, email, u.getId());
    }

    /**
     * Ends the Google step: the chosen password creates the account, completes an older one, or replaces a forgotten
     * one. After a replacement every other session of the account is signed out. A refused password keeps the
     * ticket, so the person can try another one.
     */
    @PostMapping("/google/password")
    public TokenResponse choosePassword(@Valid @RequestBody NewPassword body, HttpServletRequest request) {
        PasswordTickets.Ticket t = tickets.peek(body.ticket()).orElseThrow(PasswordTicketExpired::new);
        policy.check(body.password(), t.email());
        if (tickets.take(body.ticket()).isEmpty()) throw new PasswordTicketExpired();
        AppUser u;
        if (t.purpose() == PasswordTickets.Purpose.CREATE) {
            throttle.checkAndRecordRegister(request.getRemoteAddr());
            if (users.findByGoogleSub(t.googleSub()).isPresent() || users.existsByEmail(t.email())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This account already exists. Sign in instead.");
            }
            u = new AppUser();
            u.setEmail(t.email());
            u.setGoogleSub(t.googleSub());
            u.setRole("USER");
            u.setDisplayName(t.name() == null ? "" : t.name().trim());
        } else {
            u = users.findById(t.userId()).orElseThrow(PasswordTicketExpired::new);
            if (u.getGoogleSub() != null && !u.getGoogleSub().equals(t.googleSub())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This account is connected to another Google account");
            }
            if (t.purpose() == PasswordTickets.Purpose.SET && u.getPasswordHash() != null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This account already has a password");
            }
            u.setGoogleSub(t.googleSub());
            requireFreeSeat(u);
        }
        u.setPasswordHash(encoder.encode(body.password()));
        users.save(u);
        if (t.purpose() == PasswordTickets.Purpose.RESET) sessionRegistry.removeUser(u.getId());
        return session(u);
    }

    /**
     * Connects a Google identity to an existing password account. Both proofs are needed: a valid Google token whose
     * verified email is the account's email, and the account's password. Anyone who only registered the address
     * (without owning it) cannot pass the Google check, and anyone with only the Google login cannot pass the password check.
     */
    @PostMapping("/google/link")
    public TokenResponse linkGoogle(@Valid @RequestBody GoogleLink body, HttpServletRequest request) {
        GoogleTokenVerifier.GoogleIdentity id = verifiedGoogle(body.credential(), HttpStatus.BAD_REQUEST);
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
        return session(u);
    }

    /**
     * First step of a password change: is this the account's current password? Wrong answers count as failed sign-ins
     * (same lockout). It only lets the web app ask for the new password afterwards: PUT /password checks the current
     * password again, so skipping this step gains nothing.
     */
    @PostMapping("/password/verify")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void verifyPassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CurrentPassword body, HttpServletRequest request) {
        AppUser u = signedInWithPassword(jwt);
        String ip = request.getRemoteAddr();
        throttle.checkLogin(ip, u.getEmail());
        if (!passwordMatches(u, body.currentPassword())) {
            throttle.recordLoginFailure(ip, u.getEmail());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        throttle.clearLogin(ip, u.getEmail());
    }

    /**
     * A signed-in person changes their password: the current one is needed. Every other session of the account is
     * signed out; the answer carries a new session for this one.
     */
    @PutMapping("/password")
    public TokenResponse changePassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PasswordChange body,
                                        HttpServletRequest request) {
        AppUser u = signedInWithPassword(jwt);
        String ip = request.getRemoteAddr();
        throttle.checkLogin(ip, u.getEmail());
        if (!passwordMatches(u, body.currentPassword())) {
            throttle.recordLoginFailure(ip, u.getEmail());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        policy.check(body.newPassword(), u.getEmail());
        throttle.clearLogin(ip, u.getEmail());
        u.setPasswordHash(encoder.encode(body.newPassword()));
        users.save(u);
        sessionRegistry.removeUser(u.getId());
        return session(u);
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
        requireFreeSeatForGuest();
        throttle.checkAndRecordGuest(request.getRemoteAddr());
        AppUser u = new AppUser();
        u.setEmail("guest-" + java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 12) + "@guest.leadforge.local");
        u.setRole("GUEST");
        u.setOnboarded(true); // a guest starts straight away with a default offer
        u.setDisplayName("Guest");
        spec.apply(u);
        users.save(u);
        return session(u);
    }

    /** Revokes the caller's token on the server, so a copied token stops working at once. Always succeeds. */
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@AuthenticationPrincipal Jwt jwt) {
        if (jwt != null) sessionRegistry.revokeSession(jwt.getClaimAsString("sid"));
    }

    /** 422 with the reason, so the web app can say what to change. */
    @ExceptionHandler(PasswordPolicy.Rejected.class)
    @ResponseStatus(HttpStatus.UNPROCESSABLE_ENTITY)
    public Map<String, String> passwordRejected(PasswordPolicy.Rejected e) {
        return Map.of("problem", e.problem().name());
    }

    /** The Google step was too long ago, already used, or never happened: sign in with Google again. */
    @ResponseStatus(value = HttpStatus.GONE, reason = "This step expired. Sign in with Google again.")
    static class PasswordTicketExpired extends RuntimeException {
    }

    /** The caller's account, when it is one that has a password to check or change (not a guest or a shared demo account). */
    private AppUser signedInWithPassword(Jwt jwt) {
        if (jwt == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in first");
        AppUser u = users.findById(Long.valueOf(jwt.getSubject()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in first"));
        if (u.isDemo() || "GUEST".equals(u.getRole())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This account has no password to change");
        }
        return u;
    }

    private GoogleTokenVerifier.GoogleIdentity verifiedGoogle(String credential, HttpStatus whenInvalid) {
        if (props.google() == null || props.google().clientId() == null || props.google().clientId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Google sign-in is not enabled");
        }
        GoogleTokenVerifier.GoogleIdentity id;
        try {
            id = googleVerifier.verify(credential);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(whenInvalid, "Google sign-in could not be verified");
        }
        if (!id.emailVerified()) {
            throw new ResponseStatusException(whenInvalid, "Your Google email address is not verified");
        }
        return id;
    }

    private TokenResponse session(AppUser u) {
        return new TokenResponse(tokens.issue(u), u.getEmail(), u.getRole(), u.isDemo(), u.isOnboarded(), null);
    }

    private TokenResponse ticket(PasswordTickets.Purpose purpose, GoogleTokenVerifier.GoogleIdentity id, String email, Long userId) {
        String ticket = tickets.issue(purpose, id.sub(), email, id.name(), userId);
        return new TokenResponse(null, email, null, false, false, ticket);
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

    /** Seats limit guests and shared demo accounts. Someone with their own account is never turned away. */
    private void requireFreeSeat(AppUser u) {
        boolean takesSeat = u.isDemo() || "GUEST".equals(u.getRole());
        if (takesSeat && !u.isAdmin() && !sessionRegistry.canAcceptVisitor()) full();
    }

    private void requireFreeSeatForGuest() {
        if (!sessionRegistry.canAcceptVisitor()) full();
    }

    private void full() {
        throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "All guest seats are taken. Please try again in a few minutes, or sign in with an account.");
    }
}
