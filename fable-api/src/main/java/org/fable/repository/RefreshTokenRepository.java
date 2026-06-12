package org.fable.repository;

import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.RefreshTokenEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RefreshTokenRepository extends JpaRepository<RefreshTokenEntity, Long> {
    Optional<RefreshTokenEntity> findByToken(String token);
    List<RefreshTokenEntity> findAllByUserAndRevokedFalse(FableUserEntity user);
    void deleteByUser(FableUserEntity user);
}
