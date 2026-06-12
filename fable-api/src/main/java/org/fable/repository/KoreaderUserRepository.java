package org.fable.repository;


import org.fable.model.entity.KoreaderUserEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface KoreaderUserRepository extends JpaRepository<KoreaderUserEntity, Long> {
    Optional<KoreaderUserEntity> findByUsername(String username);

    Optional<KoreaderUserEntity> findByFableUserId(Long fableUserId);
}
