package com.leadfinder.search;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NicheSuggestionServiceTest {

    @Mock
    private ServiceNicheCacheRepository cache;

    private NicheSuggestionService service;

    @BeforeEach
    void setUp() {
        service = new NicheSuggestionService(cache);
    }

    @Test
    void returnsDefaultsWhenOfferIsBlank() {
        List<String> niches = service.suggestNiches("");
        assertFalse(niches.isEmpty());
        assertTrue(niches.contains("dental clinics"));
        verifyNoInteractions(cache);
    }

    @Test
    void mapsBookingKeywordsToAppointmentNiches() {
        when(cache.findById(any())).thenReturn(Optional.empty());

        List<String> niches = service.suggestNiches("Custom booking software and reservation systems");
        assertTrue(niches.contains("dental clinics"));
        assertTrue(niches.contains("hair salons"));
        verify(cache).save(any(ServiceNicheCache.class));
    }

    @Test
    void usesCacheWhenPresent() {
        ServiceNicheCache cached = new ServiceNicheCache("hash", "web design", "lawyers, hotels, restaurants");
        when(cache.findById(any())).thenReturn(Optional.of(cached));

        List<String> niches = service.suggestNiches("web design");
        assertEquals(3, niches.size());
        assertTrue(niches.contains("lawyers"));
        verify(cache, never()).save(any());
    }
}
