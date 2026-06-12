package org.fable.repository;

import org.fable.model.entity.MetadataFetchProposalEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface MetadataFetchProposalRepository extends JpaRepository<MetadataFetchProposalEntity, Long> {

}
