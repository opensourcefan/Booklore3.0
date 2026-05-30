package org.booklore.config.security.service;

import lombok.RequiredArgsConstructor;
import org.booklore.model.entity.BookLoreUserEntity;
import org.booklore.repository.UserRepository;
import org.hibernate.Hibernate;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthenticatedUserEntityService {

    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public BookLoreUserEntity loadForAuthentication(Long userId) {
        BookLoreUserEntity entity = userRepository.fetchByIdWithSettingsAndLibraries(userId)
                .orElseThrow(() -> new UsernameNotFoundException("User not found with ID: " + userId));

        if (entity.getLibraries() != null) {
            entity.getLibraries().forEach(library -> Hibernate.initialize(library.getLibraryPaths()));
        }

        return entity;
    }
}