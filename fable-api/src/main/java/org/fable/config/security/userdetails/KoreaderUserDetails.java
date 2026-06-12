package org.fable.config.security.userdetails;

import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;

public class KoreaderUserDetails implements UserDetails {

    private final String username;
    private final String password;
    @Getter
    private final boolean syncEnabled;
    @Getter
    private final boolean syncWithFableReader;
    @Getter
    private final Long fableUserId;
    private final Collection<? extends GrantedAuthority> authorities;

    public KoreaderUserDetails(String username, String password, boolean syncEnabled, boolean syncWithFableReader, Long fableUserId, Collection<? extends GrantedAuthority> authorities) {
        this.username = username;
        this.password = password;
        this.syncEnabled = syncEnabled;
        this.syncWithFableReader = syncWithFableReader;
        this.fableUserId = fableUserId;
        this.authorities = authorities;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public String getPassword() {
        return password;
    }

    @Override
    public String getUsername() {
        return username;
    }
}
