package com.leadfinder.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<AppUser, Long> {
    Optional<AppUser> findByEmail(String email);

    boolean existsByEmail(String email);

    Optional<AppUser> findByGoogleSub(String googleSub);

    java.util.List<AppUser> findByRoleAndCreatedAtBefore(String role, java.time.Instant before);
}
