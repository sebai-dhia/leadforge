package com.leadfinder;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

// the development settings: the stack from docker-compose.yml
@SpringBootTest
@ActiveProfiles("local")
class BackendApplicationTests {

	@Test
	void contextLoads() {
	}

}
