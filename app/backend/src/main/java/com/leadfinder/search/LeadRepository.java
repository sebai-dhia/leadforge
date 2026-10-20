package com.leadfinder.search;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface LeadRepository extends JpaRepository<Lead, Long> {

    /**
     * Shared filters. Optional filters use an "empty" value (blank string, false or 0) instead of null
     * because PostgreSQL cannot infer the type of a null parameter. The query text is a lowercase LIKE
     * pattern with backslash as the escape character.
     */
    String FILTERS = " l.userId = :uid"
            + " and ((:hidden = true and l.hiddenAt is not null) or (:hidden = false and l.hiddenAt is null))"
            + " and (:reachable = false or l.phoneKey is not null or (l.emails is not null and l.emails <> '') or (l.social is not null and l.social <> ''))"
            + " and (:signal = '' or l.reason like :signal)"
            + " and (:q = '' or lower(l.name) like :q escape '\\' or lower(l.address) like :q escape '\\')"
            + " and (:searchId = 0L or l.id in (select sl.leadId from SearchLead sl where sl.jobId = :searchId))";

    /** Takes a lock that lasts until the transaction ends, so one user's search results are stored one at a time. */
    @Query(value = "select cast(pg_advisory_xact_lock(:uid) as text)", nativeQuery = true)
    String lockUser(@Param("uid") long uid);

    Optional<Lead> findByIdAndUserId(Long id, Long userId);

    List<Lead> findByUserIdAndIdIn(Long userId, java.util.Collection<Long> ids);

    long countByUserId(Long userId);

    long countByUserIdAndHiddenAtIsNotNull(Long userId);

    long countByUserIdAndStatus(Long userId, String status);

    @Query("select count(l) from Lead l where l.userId = :uid and l.emailBody is not null and l.emailBody <> ''")
    long countDrafted(@Param("uid") Long uid);

    Optional<Lead> findFirstByUserIdAndPlaceId(Long userId, String placeId);

    Optional<Lead> findFirstByUserIdAndPhoneKey(Long userId, String phoneKey);

    Optional<Lead> findFirstByUserIdAndWebsiteHost(Long userId, String websiteHost);

    Optional<Lead> findFirstByUserIdAndNameIgnoreCaseAndAddressIgnoreCase(Long userId, String name, String address);

    @Query("select l from Lead l where l.id in (select sl.leadId from SearchLead sl where sl.jobId = :jobId)"
            + " order by l.score desc nulls last, l.name")
    List<Lead> findByJob(@Param("jobId") Long jobId);

    @Query(value = "select l from Lead l where" + FILTERS + " and (:status = '' or l.status = :status)",
            countQuery = "select count(l) from Lead l where" + FILTERS + " and (:status = '' or l.status = :status)")
    Page<Lead> search(@Param("uid") Long uid, @Param("hidden") boolean hidden, @Param("status") String status,
                      @Param("reachable") boolean reachable, @Param("signal") String signal, @Param("q") String q,
                      @Param("searchId") long searchId, Pageable pageable);

    /** Counts per status with every filter except the status itself, for the filter chips. */
    @Query("select l.status, count(l) from Lead l where" + FILTERS + " group by l.status")
    List<Object[]> statusCounts(@Param("uid") Long uid, @Param("hidden") boolean hidden, @Param("reachable") boolean reachable, @Param("signal") String signal,
                                @Param("q") String q, @Param("searchId") long searchId);
}
