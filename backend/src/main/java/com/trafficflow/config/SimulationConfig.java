package com.trafficflow.config;

import com.trafficflow.geometry.IntersectionLayout;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Registers domain singletons that are framework-agnostic plain classes. */
@Configuration
public class SimulationConfig {

    @Bean
    public IntersectionLayout intersectionLayout(SimulationProperties props) {
        return new IntersectionLayout(props);
    }
}
