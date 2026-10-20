package com.leadfinder.search;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DrawnAreaNameTest {
    private static SearchJob job(String city, String bbox) {
        SearchJob j = new SearchJob();
        j.setCity(city);
        j.setBbox(bbox);
        return j;
    }

    @Test
    void aDrawnAreaTakesTheTownOfItsResults() {
        SearchJob j = job("Map Area [10.1,36.7,10.3,36.8]", "10.1,36.7,10.3,36.8");
        N8nCallbackController.nameDrawnArea(j, "Tunis");
        assertThat(j.getCity()).isEqualTo("Map Area: Tunis [10.1,36.7,10.3,36.8]");
    }

    @Test
    void cityAndUnusableNamesAreLeftAlone() {
        SearchJob city = job("Sfax", null);
        N8nCallbackController.nameDrawnArea(city, "Tunis");
        assertThat(city.getCity()).isEqualTo("Sfax");

        SearchJob drawn = job("Map Area [1,2,3,4]", "1,2,3,4");
        N8nCallbackController.nameDrawnArea(drawn, " [] ");
        N8nCallbackController.nameDrawnArea(drawn, null);
        assertThat(drawn.getCity()).isEqualTo("Map Area [1,2,3,4]");

        N8nCallbackController.nameDrawnArea(drawn, "La [Marsa]");
        assertThat(drawn.getCity()).isEqualTo("Map Area: La Marsa [1,2,3,4]");
    }
}
