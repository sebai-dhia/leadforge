package com.leadfinder.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<AppUser, Long> {
    Optional<AppUser> findByEmail(String email);

    Optional<AppUser> findFirstByRoleOrderByIdAsc(String role);

    boolean existsByEmail(String email);

    Optional<AppUser> findByGoogleSub(String googleSub);

    java.util.List<AppUser> findByRoleAndCreatedAtBefore(String role, java.time.Instant before);

    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("update AppUser u set u.lastSeenAt = :at where u.id = :id")
    void touchLastSeen(@org.springframework.data.repository.query.Param("id") Long id,
                       @org.springframework.data.repository.query.Param("at") java.time.Instant at);

    // ---- Telegram: the columns are read-only on AppUser, these queries are the only writers

    Optional<AppUser> findByTelegramLinkCode(String code);

    Optional<AppUser> findByTelegramChatId(Long chatId);

    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("update AppUser u set u.telegramLinkCode = :code, u.telegramLinkExpiresAt = :expires,"
            + " u.telegramLanguage = :lang, u.telegramTimezone = :zone where u.id = :id")
    void setTelegramLinkCode(@org.springframework.data.repository.query.Param("id") Long id,
                             @org.springframework.data.repository.query.Param("code") String code,
                             @org.springframework.data.repository.query.Param("expires") java.time.Instant expires,
                             @org.springframework.data.repository.query.Param("lang") String lang,
                             @org.springframework.data.repository.query.Param("zone") String zone);

    /** Clears the chat from whichever account had it, so it can move to another one. */
    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("update AppUser u set u.telegramChatId = null where u.telegramChatId = :chat")
    int releaseTelegramChat(@org.springframework.data.repository.query.Param("chat") Long chatId);

    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("update AppUser u set u.telegramChatId = :chat, u.telegramNotify = true,"
            + " u.telegramLinkCode = null, u.telegramLinkExpiresAt = null where u.id = :id")
    void connectTelegram(@org.springframework.data.repository.query.Param("id") Long id,
                         @org.springframework.data.repository.query.Param("chat") Long chatId);

    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("update AppUser u set u.telegramChatId = null, u.telegramLinkCode = null,"
            + " u.telegramLinkExpiresAt = null where u.id = :id")
    void disconnectTelegram(@org.springframework.data.repository.query.Param("id") Long id);

    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("update AppUser u set u.telegramNotify = :on where u.id = :id")
    void setTelegramNotify(@org.springframework.data.repository.query.Param("id") Long id,
                           @org.springframework.data.repository.query.Param("on") boolean on);

    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("update AppUser u set u.telegramReminderHour = :hour where u.id = :id")
    void setTelegramReminderHour(@org.springframework.data.repository.query.Param("id") Long id,
                                 @org.springframework.data.repository.query.Param("hour") int hour);

    /** People with a connected chat and the reminders on. */
    java.util.List<AppUser> findByTelegramChatIdIsNotNullAndTelegramNotifyTrue();

    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("update AppUser u set u.telegramRemindedOn = :day where u.id = :id")
    void setTelegramRemindedOn(@org.springframework.data.repository.query.Param("id") Long id,
                               @org.springframework.data.repository.query.Param("day") java.time.LocalDate day);
}
