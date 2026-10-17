package com.leadfinder.auth;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;
import com.leadfinder.search.LeadRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

@RestController
@RequestMapping("/api/profile")
@RequiredArgsConstructor
public class ProfileController {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    public record Link(@Size(max = 30) String label, @Size(max = 300) String url) {}

    public record ProfileDto(String email, String offer, String displayName, String headline, String city, String about,
                             List<String> services, List<String> targets, List<Link> links, String language,
                             boolean onboarded, String role, boolean isDemo) {
        public static ProfileDto of(AppUser u) {
            return new ProfileDto(u.getEmail(), u.getOffer(), u.getDisplayName(), u.getHeadline(), u.getCity(), u.getAbout(),
                    readList(u.getServices(), new TypeReference<List<String>>() {}),
                    readList(u.getTargets(), new TypeReference<List<String>>() {}),
                    readList(u.getLinks(), new TypeReference<List<Link>>() {}),
                    u.getLanguage(), u.isOnboarded(), u.getRole(), u.isDemo());
        }
    }

    /** Every field is optional: what is left out stays as it was. */
    public record UpdateProfile(@Size(max = 2000) String offer,
                                @Size(max = 100) String displayName,
                                @Size(max = 160) String headline,
                                @Size(max = 120) String city,
                                @Size(max = 500) String about,
                                @Size(max = 3) List<@Size(max = 40) String> services,
                                @Size(max = 8) List<@Size(max = 40) String> targets,
                                @Size(max = 5) List<@Valid Link> links,
                                @Pattern(regexp = "en|fr|ar") String language,
                                Boolean onboarded) {}

    public record Stats(long leads, long drafted, long contacted, long replied) {}

    private final UserRepository users;
    private final LeadRepository leads;

    @GetMapping
    public ProfileDto get(@AuthenticationPrincipal Jwt jwt) {
        return ProfileDto.of(load(jwt));
    }

    @GetMapping("/stats")
    public Stats stats(@AuthenticationPrincipal Jwt jwt) {
        Long uid = load(jwt).getId();
        long replied = leads.countByUserIdAndStatus(uid, "REPLIED");
        long contacted = leads.countByUserIdAndStatus(uid, "CONTACTED") + replied;
        return new Stats(leads.countByUserId(uid), leads.countDrafted(uid), contacted, replied);
    }

    @PutMapping
    public ProfileDto update(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateProfile req) {
        AppUser u = load(jwt);
        if (u.isDemo()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Demo profile is read-only.");
        }
        if (req.displayName() != null) {
            if (req.displayName().isBlank()) throw bad("Your name cannot be empty.");
            u.setDisplayName(clean(req.displayName()));
        }
        if (req.headline() != null) u.setHeadline(clean(req.headline()));
        if (req.city() != null) u.setCity(clean(req.city()));
        if (req.about() != null) u.setAbout(clean(req.about()));
        if (req.language() != null) u.setLanguage(req.language());
        if (req.services() != null) u.setServices(writeList(cleanList(req.services())));
        if (req.targets() != null) u.setTargets(writeList(cleanList(req.targets())));
        if (req.links() != null) u.setLinks(writeList(cleanLinks(req.links())));
        if (req.onboarded() != null) u.setOnboarded(req.onboarded());

        if (req.offer() != null) {
            if (req.offer().isBlank()) throw bad("Describe what you offer.");
            u.setOffer(clean(req.offer()));
        } else if (req.services() != null || req.about() != null) {
            composeOffer(u);
        }
        return ProfileDto.of(users.save(u));
    }

    /** The text the AI reads: chosen services, then the person's own sentence. */
    private static void composeOffer(AppUser u) {
        List<String> services = readList(u.getServices(), new TypeReference<List<String>>() {});
        String offer = String.join(", ", services);
        if (!u.getAbout().isBlank()) offer = offer.isEmpty() ? u.getAbout() : offer + ". " + u.getAbout();
        if (!offer.isBlank()) u.setOffer(offer.length() > 2000 ? offer.substring(0, 2000) : offer);
    }

    private static String clean(String s) {
        return s.replaceAll("[\\p{Cntrl}&&[^\\n]]", "").trim();
    }

    private static List<String> cleanList(List<String> in) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (String s : in) {
            if (s != null && !clean(s).isEmpty()) out.add(clean(s));
        }
        return new ArrayList<>(out);
    }

    /** Only plain web addresses: a "javascript:" or "data:" link would run in the page that shows it. */
    private static List<Link> cleanLinks(List<Link> in) {
        List<Link> out = new ArrayList<>();
        for (Link l : in) {
            String label = l.label() == null ? "" : clean(l.label());
            String url = l.url() == null ? "" : clean(l.url());
            if (label.isEmpty() && url.isEmpty()) continue;
            if (!url.matches("(?i)^https?://[^\\s/$.?#][^\\s]*$") || label.isEmpty()) {
                throw bad("Each link needs a name and a web address starting with http:// or https://.");
            }
            out.add(new Link(label, url));
        }
        return out;
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    static <T> List<T> readList(String json, TypeReference<List<T>> type) {
        try {
            return json == null || json.isBlank() ? List.of() : JSON.readValue(json, type);
        } catch (Exception e) {
            return List.of();
        }
    }

    private static String writeList(Object list) {
        try {
            return JSON.writeValueAsString(list);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private AppUser load(Jwt jwt) {
        return users.findById(Long.valueOf(jwt.getSubject()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }
}
