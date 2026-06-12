package org.fable.config.security.service;

import org.fable.config.security.userdetails.OpdsUserDetails;
import org.fable.exception.ApiError;
import org.fable.mapper.OpdsUserV2Mapper;
import org.fable.model.dto.OpdsUserV2;
import org.fable.model.entity.OpdsUserV2Entity;
import org.fable.repository.OpdsUserV2Repository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;


@Service
@RequiredArgsConstructor
public class OpdsUserDetailsService implements UserDetailsService {

    private final OpdsUserV2Repository opdsUserV2Repository;
    private final OpdsUserV2Mapper opdsUserV2Mapper;

    @Override
    public OpdsUserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        OpdsUserV2Entity userV2 = opdsUserV2Repository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("Invalid credentials"));
        OpdsUserV2 mappedCredential = opdsUserV2Mapper.toDto(userV2);
        return new OpdsUserDetails(mappedCredential);
    }
}