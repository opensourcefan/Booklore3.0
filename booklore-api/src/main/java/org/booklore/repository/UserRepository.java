package org.booklore.repository;

import org.booklore.model.entity.BookLoreUserEntity;
import org.booklore.model.enums.ProvisioningMethod;
import org.jspecify.annotations.NonNull;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<BookLoreUserEntity, Long> {

    Optional<BookLoreUserEntity> findByUsername(String username);

    Optional<BookLoreUserEntity> findByEmail(String email);

    Optional<BookLoreUserEntity> findById(@NonNull Long id);

    long countByProvisioningMethod(ProvisioningMethod provisioningMethod);

    Optional<BookLoreUserEntity> findByOidcIssuerAndOidcSubject(String oidcIssuer, String oidcSubject);

    /**
     * Eagerly fetches settings and libraries for the JWT authentication filter.
     * Uses JPQL JOIN FETCH to avoid LazyInitializationException outside a
     * transaction while keeping entity-level annotations set to LAZY for all
     * other callers.  Named with a 'fetch' prefix so Spring Data's method-name
     * parser does not attempt to derive a query from the method signature.
     */
    @Query("SELECT DISTINCT u FROM BookLoreUserEntity u "
         + "LEFT JOIN FETCH u.settings "
         + "LEFT JOIN FETCH u.libraries lib "
         + "LEFT JOIN FETCH lib.libraryPaths "
         + "WHERE u.id = :id")
    Optional<BookLoreUserEntity> fetchByIdWithSettingsAndLibraries(@Param("id") Long id);
}

