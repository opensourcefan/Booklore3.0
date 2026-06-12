package org.fable.config.security.service;

import lombok.RequiredArgsConstructor;
import org.fable.model.entity.FableUserEntity;
import org.fable.repository.UserRepository;
import org.hibernate.Hibernate;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthenticatedUserEntityService {

    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public FableUserEntity loadForAuthentication(Long userId) {
        FableUserEntity entity = userRepository.fetchByIdWithSettingsAndLibraries(userId)
                .orElseThrow(() -> new UsernameNotFoundException("User not found with ID: " + userId));

        if (entity.getLibraries() != null) {
            entity.getLibraries().forEach(library -> Hibernate.initialize(library.getLibraryPaths()));
        }

        return entity;
    }
}