package org.fable.repository;

import org.fable.model.entity.FableUserEntity;
import org.fable.model.enums.ProvisioningMethod;
import org.jspecify.annotations.NonNull;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<FableUserEntity, Long> {

    Optional<FableUserEntity> findByUsername(String username);

    Optional<FableUserEntity> findByEmail(String email);

    Optional<FableUserEntity> findById(@NonNull Long id);

    long countByProvisioningMethod(ProvisioningMethod provisioningMethod);

    Optional<FableUserEntity> findByOidcIssuerAndOidcSubject(String oidcIssuer, String oidcSubject);

    /**
     * Eagerly fetches settings and libraries for the JWT authentication filter.
     * Uses JPQL JOIN FETCH to avoid LazyInitializationException outside a
     * transaction while keeping entity-level annotations set to LAZY for all
     * other callers.  Named with a 'fetch' prefix so Spring Data's method-name
     * parser does not attempt to derive a query from the method signature.
     */
    @Query("SELECT DISTINCT u FROM FableUserEntity u "
         + "LEFT JOIN FETCH u.settings "
            + "LEFT JOIN FETCH u.libraries "
         + "WHERE u.id = :id")
    Optional<FableUserEntity> fetchByIdWithSettingsAndLibraries(@Param("id") Long id);
}

