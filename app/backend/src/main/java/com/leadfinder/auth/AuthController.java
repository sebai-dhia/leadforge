package com.leadfinder.auth;

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

    public record TokenResponse(String token, String email) {}

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final TokenService tokens;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public TokenResponse register(@Valid @RequestBody Credentials c) {
        String email = c.email().trim().toLowerCase();
        if (users.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered");
        }
        AppUser u = new AppUser();
        u.setEmail(email);
        u.setPasswordHash(encoder.encode(c.password()));
        users.save(u);
        return new TokenResponse(tokens.issue(u), u.getEmail());
    }

    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody Credentials c) {
        AppUser u = users.findByEmail(c.email().trim().toLowerCase())
                .filter(x -> encoder.matches(c.password(), x.getPasswordHash()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
        return new TokenResponse(tokens.issue(u), u.getEmail());
    }
}
