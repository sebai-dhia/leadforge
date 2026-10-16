package com.leadfinder.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/profile")
@RequiredArgsConstructor
public class ProfileController {

    public record ProfileDto(String email, String offer, String displayName, String language, String role, boolean isDemo) {
        static ProfileDto of(AppUser u) {
            return new ProfileDto(u.getEmail(), u.getOffer(), u.getDisplayName(), u.getLanguage(), u.getRole(), u.isDemo());
        }
    }

    public record UpdateProfile(@NotBlank @Size(max = 2000) String offer,
                                @NotBlank @Size(max = 100) String displayName,
                                @Pattern(regexp = "en|fr|ar") String language) {}

    private final UserRepository users;

    @GetMapping
    public ProfileDto get(@AuthenticationPrincipal Jwt jwt) {
        return ProfileDto.of(load(jwt));
    }

    @PutMapping
    public ProfileDto update(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateProfile req) {
        AppUser u = load(jwt);
        if (u.isDemo()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Demo profile is read-only.");
        }
        u.setOffer(req.offer().trim());
        u.setDisplayName(req.displayName().trim());
        u.setLanguage(req.language());
        return ProfileDto.of(users.save(u));
    }

    private AppUser load(Jwt jwt) {
        return users.findById(Long.valueOf(jwt.getSubject()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }
}
