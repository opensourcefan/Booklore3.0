package org.fable.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.fable.FableApplication;
import org.fable.config.security.service.AuthenticatedUserEntityService;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.LibraryEntity;
import org.fable.model.entity.LibraryPathEntity;
import org.fable.service.task.TaskCronService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.mockito.Mockito.mock;

@SpringBootTest(classes = {
                FableApplication.class
})
@Transactional
@Import(UserRepositoryFetchTest.TestConfig.class)
@TestPropertySource(properties = {
        "spring.flyway.enabled=false",
                "spring.jpa.hibernate.ddl-auto=create-drop",
                "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
                "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
                "spring.datasource.url=jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1",
                "spring.datasource.driver-class-name=org.h2.Driver",
                "spring.datasource.username=sa",
                "spring.datasource.password=",
                "app.path-config=build/tmp/test-config",
                "app.bookdrop-folder=build/tmp/test-bookdrop",
                "spring.main.allow-bean-definition-overriding=true",
                "spring.task.scheduling.enabled=false",
                "app.task.scan-library-cron=*/1 * * * * *",
                "app.task.process-bookdrop-cron=*/1 * * * * *",
                "app.features.oidc-enabled=false"
})
class UserRepositoryFetchTest {

        @org.springframework.boot.test.context.TestConfiguration
        static class TestConfig {
                @Bean("flyway")
                @Primary
                public org.flywaydb.core.Flyway flyway() {
                        return mock(org.flywaydb.core.Flyway.class);
                }

                @Bean
                @Primary
                public TaskCronService taskCronService() {
                        return mock(TaskCronService.class);
                }
        }

        @PersistenceContext
        private EntityManager entityManager;

        @Autowired
        private AuthenticatedUserEntityService authenticatedUserEntityService;

    @Test
        void authenticatedUserLoader_initializesLibraryPathsForDetachedMapping() {
        LibraryEntity library = LibraryEntity.builder()
                .name("Main Library")
                .icon("book")
                .watch(false)
                .build();
        library = persistAndFlush(library);

        LibraryPathEntity libraryPath = LibraryPathEntity.builder()
                .library(library)
                .path("/books/library-one")
                .build();
        persistAndFlush(libraryPath);

        FableUserEntity user = FableUserEntity.builder()
                .username("auth-user")
                .passwordHash("hash")
                .name("Auth User")
                .isDefaultPassword(false)
                .libraries(List.of(library))
                .build();
        user = persistAndFlush(user);

        entityManager.clear();

        FableUserEntity fetchedUser = authenticatedUserEntityService.loadForAuthentication(user.getId());
        LibraryEntity fetchedLibrary = fetchedUser.getLibraries().getFirst();

        entityManager.clear();

        assertThatNoException().isThrownBy(() -> assertThat(fetchedLibrary.getLibraryPaths())
                .extracting(LibraryPathEntity::getPath)
                .containsExactly("/books/library-one"));
    }

        private <T> T persistAndFlush(T entity) {
                entityManager.persist(entity);
                entityManager.flush();
                return entity;
        }
}