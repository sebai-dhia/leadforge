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

    public record TokenResponse(String token, String email, String role, boolean isDemo) {}

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final TokenService tokens;
    private final AuthThrottle throttle;
    private final ActiveSessionRegistry sessionRegistry;
    private final AppProperties props;

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
        return new TokenResponse(tokens.issue(u), u.getEmail(), u.getRole(), u.isDemo());
    }

    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody Credentials c, HttpServletRequest request) {
        String ip = request.getRemoteAddr();
        String email = c.email().trim().toLowerCase();
        throttle.checkLogin(ip, email);
        AppUser u = users.findByEmail(email)
                .filter(x -> encoder.matches(c.password(), x.getPasswordHash()))
                .orElse(null);
        if (u == null) {
            throttle.recordLoginFailure(ip, email);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        if (u.isDemo() && !sessionRegistry.canAcceptVisitor()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Demo is currently full (5 active sessions). Please try again in a few minutes.");
        }
        throttle.clearLogin(ip, email);
        return new TokenResponse(tokens.issue(u), u.getEmail(), u.getRole(), u.isDemo());
    }
}
