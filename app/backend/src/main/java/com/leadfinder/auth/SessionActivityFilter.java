package com.leadfinder.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * On every authenticated request: keeps the visitor's demo seat alive (its last active time) and records
 * when the person was last seen, for the admin.
 */
@Component
@RequiredArgsConstructor
public class SessionActivityFilter extends OncePerRequestFilter {

    private final ActiveSessionRegistry sessionRegistry;
    private final LastSeen lastSeen;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        filterChain.doFilter(request, response);
        touchActiveSession();
    }

    private void touchActiveSession() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt)) return;
        try {
            lastSeen.touch(Long.valueOf(jwt.getSubject()));
        } catch (RuntimeException e) {
            logger.debug("Could not record last seen", e); // never fails the request
        }
        String sid = jwt.getClaimAsString("sid");
        if (sid != null && !"ADMIN".equalsIgnoreCase(jwt.getClaimAsString("role"))) {
            sessionRegistry.touchSession(sid, true);
        }
    }
}
