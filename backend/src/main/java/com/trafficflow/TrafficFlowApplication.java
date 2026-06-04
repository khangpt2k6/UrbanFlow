package com.trafficflow;

import com.trafficflow.config.SimulationProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(SimulationProperties.class)
public class TrafficFlowApplication {

    public static void main(String[] args) {
        SpringApplication.run(TrafficFlowApplication.class, args);
    }
}
